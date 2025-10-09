const express = require("express");
const app = express();
const port = parseInt(process.env.PORT) || 5000;
const cors = require("cors");
const jwt = require('jsonwebtoken');
const Stripe=require('stripe')
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require("mongodb");
require("dotenv").config();

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // verify token midilwere

      let verifyToken = (req, res, next) => {

        const authHeader =  req.headers.authorization;

        if(!authHeader){
          return res.status(401).json({message:'unauthorizes'})
        }

        const token=authHeader.split(' ')[1];

        if(!token){
          return res.status(401).json({message:'unauthorizes'})
        }

        jwt.verify(token, process.env.SECRITE_TOKEN, (errr, decode)=>{

          if(errr){
             return res.status(401).json({message:'forbiden access'})

          }

          req.decode = decode
          next()
        })

      };

      //verify admin 

      const verifyAdmin =async(req, res, next)=>{

        const email=req.decode.email;
        const query={email:email};

        const user=await usersCollection.findOne(query);

        const admin=user?.role == 'admin';

        if(!admin){


          return res.status(401).json({message:'un authorizes'})

        }


        next()

      }




     // auth related apis
    
      app.post('/jwt', (req, res) => {
      const { email } = req.body;  // client থেকে আসছে {email: "..."}

      if (!email) {
        return res.status(400).json({ message: "Email required" });
      }

      const token = jwt.sign(
        { email },  // payload হিসেবে email দিচ্ছি
        process.env.SECRITE_TOKEN,
        { expiresIn: '1h' }
      );


      res.status(200).json({ token });

    });




    //menu related api
    const menuCollection = client.db("BristoDB").collection("menu");

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();

      if (result) {
        res.status(200).json({ data: result });

      }
    });

      app.delete("/menu/:id", async (req, res) => {

        const id=req.params.id

        const query={_id: new ObjectId(id)}

      const result = await menuCollection.deleteOne(query);

      if (result) {

        res.status(200).json({ data: result });

      }
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
        image: item.image, // ✅ সরাসরি image
        category: item.category.toLowerCase(),
        price: item.price,
      }
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



    //Cart  related Apis
    const cartCollection = client.db("BristoDB").collection("carts");

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;

      const result = await cartCollection.insertOne(cartItem);
      res.status(201).json({ data: result });
    });

     app.get("/carts", verifyToken,  async (req, res) => {

         const email = req.query.email;
      const result =await cartCollection.find({ email }).toArray();
      res.status(200).json(result);

      
    });

     app.delete("/carts/:id", verifyToken, async (req, res) => {

       const id = req.params.id;

      const result = await cartCollection.deleteOne({ _id: new ObjectId(id)});
      res.status(200).json(result);


      
    });

    // users related apis
    const usersCollection = client.db("BristoDB").collection("users");

    app.get('/users/admin/:email', async (req, res)=>{


       const email=req.params.email;

      if(!email){
        return res.status(403).json({message:'un authorizes'})
      }

      const query={email:email}

      const user=await usersCollection.findOne(query);

      let isAdmin=false;

      if(user){
        isAdmin=user?.role == 'admin';
      }

      res.status(200).json(isAdmin)


    })

    app.post('/users', async(req,res)=>{
      const user = req.body;
    
      const exisets = await usersCollection.findOne({email: user.email})
      if(!exisets){
        const result = await usersCollection.insertOne(user);
      res.status(201).json({ data: result });
      }else{
        res.json({data: 'user alredy exites'})
      }
    }),

    app.get('/users', verifyToken,verifyAdmin, async(req,res)=>{
      
      const result=await usersCollection.find().toArray();
      res.status(200).json(result);
    })

     app.delete('/users/:id', verifyToken, verifyAdmin, async(req,res)=>{
      
       const id = req.params.id;

      const result = await usersCollection.deleteOne({ _id: new ObjectId(id)});
      res.status(200).json(result);
    })

     app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req,res)=>{
      
       const id = req.params.id;
       const filter={_id : new ObjectId(id)}
          const update = { 
          $set: { role: 'admin' } 


}


      const result = await usersCollection.updateOne(filter, update);
      res.status(200).json(result);
    })

    //payment related apis
    const payment_key=process.env.SECRITE_API_KEY;
    const stripe = new Stripe(payment_key);

      app.post("/create-payment-intent", async (req, res) => {
        try {
          const { amount } = req.body;

          const convertedAmount=parseInt(amount * 100);

          const paymentIntent = await stripe.paymentIntents.create({
            amount: convertedAmount, // e.g. 5000 = $50
            currency: "usd",
            // automatic_payment_methods: { enabled: true },
            payment_method_types:['card']
          });

          res.send({
            clientSecret: paymentIntent.client_secret,
          });
        } catch (error) {
          res.status(500).send({ error: error.message });
        }
      });

          const paymentCollection = client.db("BristoDB").collection("payments");
      app.post('/payments', async(req, res)=>{

        const payment=req.body;

        const result=await paymentCollection.insertOne(payment);

        const query={_id: {$in: payment.cartItemId.map(_id=> new ObjectId(_id))}}
        const deleteResult=await cartCollection.deleteMany(query);
         res.status(200).json({data: result, deleteResult})

        // const result=await paymentCollection.insertOne(payment);
      });

      app.get('/payments/:email', verifyToken , async(req, res)=>{

        const email=req.params.email;

        if(email !== req.decode.email){
          return res.status(403).json({message:'forbiden access'})
        }

        const query={email: email}

        const result=await paymentCollection.find(query).toArray();
        res.status(200).json(result);


      })

      //analatices 
      app.get('/admin-stats', async (req,res)=>{

        const totalUsers= await usersCollection.estimatedDocumentCount();
        const menuItems=await menuCollection.estimatedDocumentCount();
        const orders=await paymentCollection.estimatedDocumentCount();
        const payments= await paymentCollection.find().toArray();

        const revenue=payments.reduce((sum, payment)=> sum + payment.amount, 0)

        res.status(200).json({ totalUsers, menuItems, orders, revenue });

      })

      // user analatces
      app.get('/user-stats', verifyToken, async (req,res)=>{

        const email=req.decode.email;
        const query={email: email}

        const totalOrders= await paymentCollection.countDocuments(query);
        const totalSpent= await paymentCollection.aggregate([
          { $match: query },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]).toArray();

        res.status(200).json({ totalOrders, totalSpent: totalSpent[0]?.total || 0 });
      })
    // Send a ping to confirm a successful connection database
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }

}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
}); 