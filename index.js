const express = require("express");
const app = express();
const port = parseInt(process.env.PORT) || 5000;
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const SSLCommerzPayment = require('sslcommerz-lts')
const { v4: uuidv4 } = require('uuid');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");
require("dotenv").config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ CORS সমাধান: ত্রুটির ডোমেইন সহ সব প্রয়োজনীয় Origin যোগ করা হলো।
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://brist-boss.surge.sh",
      // 🚀 ত্রুটির ডোমেইনটি এখানে যোগ করা হলো
      "https://bristo-boss-seven.vercel.app",
    ],
    credentials: true,
  })
);

app.get("/", (req, res) => {
  console.log("server is running");
  res.send("server is running");
});

const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.26qzwj8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // middleware: verify token
    let verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ message: "unauthorizes" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "unauthorizes" });
      }
      jwt.verify(token, process.env.SECRITE_TOKEN, (errr, decode) => {
        if (errr) {
          return res.status(403).json({ message: "forbiden access" }); // 403 status is more appropriate for forbidden access
        }
        req.decode = decode;
        next();
      });
    };

    // database collections
    const db = client.db("BristoDB");
    const usersCollection = db.collection("users");
    const menuCollection = db.collection("menu");
    const cartCollection = db.collection("carts");
    const paymentCollection = db.collection("payments");

    // middleware: verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decode.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const admin = user?.role == "admin";
      if (!admin) {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // --------------------------------------------------------------------------------------------------
    // Auth related apis

    app.post("/jwt", (req, res) => {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email required" });
      }
      const token = jwt.sign({ email }, process.env.SECRITE_TOKEN, {
        expiresIn: "1h",
      });
      res.status(200).json({ token });
    });

    // --------------------------------------------------------------------------------------------------
    // Menu related api

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.status(200).json({ data: result });
    });

    app.delete("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.status(200).json({ data: result });
    });

    app.patch("/menu/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const item = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            name: item.name,
            recipe: item.recipe,
            image: item.image,
            category: item.category.toLowerCase(),
            price: item.price,
          },
        };
        const result = await menuCollection.updateOne(query, updateDoc);

        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "success", data: result });
        } else {
          res.status(404).json({ message: "No document updated" });
        }
      } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // --------------------------------------------------------------------------------------------------
    // Cart related Apis

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.status(201).json({ data: result });
    });

    app.get("/carts", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decode.email) {
        return res.status(403).json({ message: "Forbidden access" });
      }
      const result = await cartCollection.find({ email }).toArray();
      res.status(200).json(result);
    });

    app.delete("/carts/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });
      res.status(200).json(result);
    });

    // --------------------------------------------------------------------------------------------------
    // Users related apis

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;

      // টোকেন যাচাই করা হয়নি, তাই req.decode.email ব্যবহার করা যাবে না
      // এখানে শুধু ইমেইল দিয়ে ইউজার চেক করা হচ্ছে, যা আপনার useAdmin.jsx-এর জন্য প্রয়োজন
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      let isAdmin = false;
      if (user) {
        isAdmin = user?.role == "admin";
      }

      // একটি অবজেক্ট আকারে পাঠান, যা ফ্রন্টএন্ডে রিসিভ করা সহজ
      res.send(isAdmin);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const exisets = await usersCollection.findOne({ email: user.email });
      if (!exisets) {
        const result = await usersCollection.insertOne(user);
        res.status(201).json({ data: result });
      } else {
        res.status(200).json({ data: "user alredy exites" });
      }
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.status(200).json(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.status(200).json(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const update = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, update);
        res.status(200).json(result);
      }
    );

    // --------------------------------------------------------------------------------------------------
    // Payment related apis

    const payment_key = process.env.SECRITE_API_KEY;
    const stripe = new Stripe(payment_key);

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount } = req.body;
        const convertedAmount = parseInt(amount * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: convertedAmount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;
        const result = await paymentCollection.insertOne(payment);
        const deleteQuery = {
          _id: { $in: payment.cartItemId.map((id) => new ObjectId(id)) },
        }; // ⚠️ cartItemId array-কে ObjectId-তে কনভার্ট করা আবশ্যক
        const deleteResult = await cartCollection.deleteMany(deleteQuery);

        res.status(200).json({ data: result, deleteResult });
      } catch (err) {
        console.error("Payment insert error:", err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decode.email) {
        return res.status(403).json({ message: "forbiden access" });
      }
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.status(200).json(result);
    });

    // --------------------------------------------------------------------------------------------------
    // Analytics

    app.get("/admin-stats", async (req, res) => {
      // Note: This endpoint is public. For production, apply verifyToken and verifyAdmin.
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const payments = await paymentCollection.find().toArray();

      const revenue = payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );

      res.status(200).json({ totalUsers, menuItems, orders, revenue });
    });
    //------------------------------------------------------------------------------------------------------

      const store_id = 'midla68ef5f2b0cf63'
      const store_passwd = 'midla68ef5f2b0cf63@ssl'
      const is_live = false //true for live, false for sandbox


    //payment sslcommerce

    app.post("/create-payment", async (req, res) => {
      const { price } = req.body;

       const data = {
        total_amount: price,
        currency: 'BDT',
        tran_id: uuidv4(), // use unique tran_id for each api call
        success_url: 'http://localhost:5000/success-payment',
        fail_url: 'http://localhost:3030/fail',
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: 'Computer.',
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: 'Customer Name',
        cus_email: 'customer@example.com',
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
    };
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
    sslcz.init(data).then(apiResponse => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.status(200).json({data: GatewayPageURL})
        console.log('Redirecting to: ', GatewayPageURL)
    });

    console.log(data)




    });

    app.post('/success-payment', (req, res)=>{


        const success= req.body;
        console.log(success)
       
    })


  } finally {
    // ...
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;
