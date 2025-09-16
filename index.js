const express = require("express");
const app = express();
const port = parseInt(process.env.PORT) || 5000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

    const menuCollection = client.db("BristoDB").collection("menu");

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();

      if (result) {
        res.status(200).json({ data: result });
      }
    });

    //Cart  related Apis
    const cartCollection = client.db("BristoDB").collection("carts");

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;

      const result = await cartCollection.insertOne(cartItem);
      res.status(201).json({ data: result });
    });

     app.get("/carts", async (req, res) => {
       const email = req.query.email;

      const result =await cartCollection.find({ email }).toArray();
      res.status(200).json(result);


      
    });

     app.delete("/carts/:id", async (req, res) => {

       const id = req.params.id;

      const result = await cartCollection.deleteOne({ _id: new ObjectId(id)});
      res.status(200).json(result);


      
    });

    // users related apis
    const usersCollection = client.db("BristoDB").collection("users");

    app.post('/users', async(req,res)=>{
      const user = req.body;
    
      const exisets =usersCollection.findOne({email: user.email})
      if(!exisets){
        const result = await usersCollection.insertOne(user);
      res.status(201).json({ data: result });
      }else{
        res.json({data: 'user alredy exites'})
      }
    }),

    app.get('/users', async(req,res)=>{
      
      const result=await usersCollection.find().toArray();
      res.status(200).json(result);
    })

     app.delete('/users/:id', async(req,res)=>{
      
       const id = req.params.id;

      const result = await usersCollection.deleteOne({ _id: new ObjectId(id)});
      res.status(200).json(result);
    })

     app.patch('/users/admin/:id', async(req,res)=>{
      
       const id = req.params.id;
       const filter={_id : new ObjectId(id)}
  const update = { 
  $set: { role: 'admin' } 
}


      const result = await usersCollection.updateOne(filter, update);
      res.status(200).json(result);
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
