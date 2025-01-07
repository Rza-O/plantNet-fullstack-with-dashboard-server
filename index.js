require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

const port = process.env.PORT || 9000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kbg9j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    const usersCollection = client.db('plantNet').collection('users');
    const plantsCollection = client.db('plantNet').collection('plants')
    const ordersCollection = client.db('plantNet').collection('orders')

    // save or update user in db
    app.post('/users/:email', async (req,res) => {
      const { email } = req.params;
      const query = { email };
      const user = req.body;
      // Checking if user exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }

      const result = await usersCollection.insertOne({...user, role: 'customer',timestamp: Date.now()});
      res.send(user);
    })


    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })


    // save a plant data in db
    app.post('/plants', verifyToken, async (req,res) => {
      const plant = req.body;
      const result = await plantsCollection.insertOne(plant);
      res.send(result);
    })

    // Get all plants from db
    app.get('/plants', async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    })

    // Get a plant by id
    app.get('/plant/:id', async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await plantsCollection.findOne(query);
      res.send(result);
    })

    // save order to the db
    app.post('/order', verifyToken, async (req, res) => {
      const orderInfo = req.body;
      console.log(orderInfo)
      const result = await ordersCollection.insertOne(orderInfo);
      res.send(result);
    })

    // manage plant quantity
    app.patch('/plants/quantity/:id', verifyToken, async (req,res) => {
      const { id } = req.params;
      const {quantityToUpdate, status} = req.body;
      const filter = { _id: new ObjectId(id) };
      let updateDoc = {
        $inc: {quantity: -quantityToUpdate}
      }
      if (status === 'increase') {
        updateDoc = {
          $inc: { quantity: quantityToUpdate }
        }
      }
      const result = await plantsCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    // get a customers all orders
    app.get('/customer-orders/:email', verifyToken, async (req,res) => {
      const email = req.params.email;
      const query = { "customer.email": email };
      const result = await ordersCollection.aggregate([
      // we matched the query in the orders collection
        {
          $match: query,
        },
        // we made the plantId as an objectId
        {
          $addFields: {
            plantId: {$toObjectId: '$plantId'}
          }
        },
        // we matched the plant id in plants collection with that object id and return every matched plants in an array name plants
        {
          $lookup: {
            from: "plants",
            localField: 'plantId',
            foreignField: '_id',
            as: 'plants'
          },
        },
        // we unwind the array to expose the object inside
        {
          $unwind: '$plants'
        },
        // we only kept the necessary fields we needed from the data
        {
          $addFields: {
            name: '$plants.name',
            category: '$plants.category',
            image: '$plants.image',
          }
        },
        // we remove the plant object from the data
        {
          $project: {
            plants: 0
          }
        }
      ]).toArray();
      res.send(result);
    })

    // cancel/delete an order
    app.delete('/order/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const order = await ordersCollection.findOne(query);
      if(order.status === 'delivered') return res.status(409).send('Cannot Cancel once the order is delivered')
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    })


    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
