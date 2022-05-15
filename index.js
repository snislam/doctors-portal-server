const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { listen } = require('express/lib/application');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

// midle ware
app.use(cors())
app.use(express.json())

// mongodb connection
const uri = `mongodb+srv://${process.env.DP_USER1}:${process.env.DP_PASS}@doctors-portal.yp0gd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        console.log("DATABASE CONNECTED")

        const serviceCollection = client.db('doctors-portal').collection('services');
        const bookingCollection = client.db('doctors-portal').collection('bookings');

        // get service data
        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
        })

        // post bookings
        app.post("/bookings", async (req, res) => {
            const body = req.body
            const result = await bookingCollection.insertOne(body)
            res.send(result)
            console.log(body)
        })
    }
    finally {

    }
}

run().catch(console.dir)


// get main directory data
app.get("/", (req, res) => {
    res.send("I am ready. Let's go ....")
})

// listen app
app.listen(port, () => {
    console.log("port", port)
})