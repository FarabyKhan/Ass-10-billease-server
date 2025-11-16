const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require("dotenv").config()
const admin = require("firebase-admin");
const app = express()
const port = 3000


const serviceAccount = require("./billease-clint-auth-firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


app.use(cors())
app.use(express.json())



const verifyFirebaseToken =async(req, res, next)=>{
  console.log('in a verify middleware', req.headers.authorization);
  if(!req.headers.authorization){
    return res.status(401).send({message:'unauthorize access'})
  }
  const token = req.headers.authorization.split(' ')[1];

  if(!token){
    return res.status(401).send({message:'unauthorize access'})
  }

  try{
  const userTokenInfo = await admin.auth().verifyIdToken(token)
  req.token_email = userTokenInfo.email;
  console.log('after token verification', userTokenInfo);
  next();

  }
  catch{
    return res.status(401).send({message:'unauthorize access'})
  }

}



const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@am.7mxwxuq.mongodb.net/?appName=AM`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('billeaseDBUser')
    const billsCollection = db.collection('bills')
    const userCollection = db.collection('user')
    const myBillsCollection = db.collection('myBills')

    app.post('/user', async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ message: 'User already exist ,do not need to insert again' })
      }
      else {
        const result = await userCollection.insertOne(newUser)
        res.send(result);
      }

    })

    app.get('/bills', async (req, res) => {
       const category = req.query.category;
      let query ={};

      if(category && category !== "All"){
        query = {category: category};
      }
      
      const result = await billsCollection.find(query).toArray()
      res.send(result)
    })

    

    app.get('/bills/:id',verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await billsCollection.findOne(query)
      res.send(result);
    })

    app.get('/latest-bills', async (req, res) => {
      const cursor = billsCollection.find().sort({ date: -1 }).limit(6)
      const result = await cursor.toArray();
      res.send(result)

    })

    app.get('/myBills',verifyFirebaseToken, async(req, res)=>{
       console.log('headers',req); 
      const  email  = req.query.email;
      const query = {};
      if(email){
        if(email !== req.token_email){
          return res.status(403).send({message:'forbidden access'})
        }
        query.email = email;
      }

      const cursor = myBillsCollection.find(query)
      const result = await cursor.toArray();
      res.send(result)
    })

    app.post('/myBills',async(req, res)=>{
     
      
      const payment = req.body;

      const billData = await billsCollection.findOne({_id:new ObjectId(payment.billId)})
      if(!billData)
        return res.status(404).send({message:"Bill not found"})

      const existingPayment = await myBillsCollection.findOne({
        email:payment.email,
        billId: payment.billId
      })

      if(existingPayment){
        return res.status(400).send({message:"You have already paid this bill "})
      }

      const billDate = new Date(billData.date);
      const present = new Date();
      if(billDate.getMonth()  !== present.getMonth() ||
       billDate.getFullYear() !== present.getFullYear()){

        return res.status(400).send({message:"You can only pay current month bills "})
      };

      const result = await myBillsCollection.insertOne(payment);
      res.send({message: "Payment is successful", result})
        
    })

    
    app.delete('/myBills/:id', async(req, res)=>{
        const id = req.params.id;
        const query ={_id: new ObjectId(id)}
        const result = await myBillsCollection.deleteOne(query)
        res.send(result)

    })

   app.put('/myBills/:id', async(req, res)=>{
     const id = req.params.id;
     const {email,...updateInfo } = req.body;

        const filter ={_id: new ObjectId(id), email}
        const updateBill ={
          $set: {
            amount:updateInfo.amount,
            address: updateInfo.address,
            phone: updateInfo.phone,
            date: updateInfo.date,
          },
        };
        const result = await myBillsCollection.updateOne(filter,updateBill)
        res.send(result)

   })

    
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Server is running')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
