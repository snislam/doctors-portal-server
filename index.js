const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require("stripe")(process.env.DP_STRIPE_SECRET);
const { listen } = require('express/lib/application');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// midle ware
app.use(cors())
app.use(express.json())

// mongodb connection
const uri = `mongodb+srv://${process.env.DP_USER1}:${process.env.DP_PASS}@doctors-portal.yp0gd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function verifyJwt(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).send({ message: "Unautorized" })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.DP_JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden' })
        } else {
            req.decoded = decoded;
            next();
        }
    })
}

async function run() {
    try {
        await client.connect();
        console.log("DATABASE CONNECTED")


        const serviceCollection = client.db('doctors-portal').collection('services');
        const bookingCollection = client.db('doctors-portal').collection('bookings');
        const userCollection = client.db('doctors-portal').collection('users');
        const doctorCollection = client.db('doctors-portal').collection('doctors');
        const paymentCollection = client.db('doctors-portal').collection('payments');
        const projectCollection = client.db('doctors-portal').collection('projects');

        const verifyAdmin = async (req, res, next) => {
            const requesterEmail = req.decoded.email;
            const requester = await userCollection.findOne({ email: requesterEmail })
            if (requester.role === 'admin') {
                next()
            }
            else {
                return res.status(403).send({ message: 'forbidden' })
            }
        }

        /* ----------------------------------
            This api are for portfolio start
        ------------------------------------*/

        app.get('/projects', async (req, res) => {
            const projects = await projectCollection.find({}).toArray();
            res.send(projects)
        })

        app.get('/project/:id', async (req, res) => {
            const id = req.params.id;
            const project = await projectCollection.findOne({ _id: ObjectId(id) })
            res.send(project)
        })


        /* ----------------------------------
            This api are for portfolio end
        ------------------------------------*/


        // get service data
        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
        })

        // get service name array
        app.get('/servicesname', async (req, res) => {
            const result = await serviceCollection.find().project({ name: 1 }).toArray()
            res.send(result)
        })


        // post bookings
        app.post("/bookings", async (req, res) => {
            const booking = req.body
            const query = {
                treatmentName: booking.treatmentName, date: booking.date, patient: booking.patient
            }
            const exist = await bookingCollection.findOne(query);
            if (exist) {
                return res.send({ success: false, booking: exist })
            } else {
                const result = await bookingCollection.insertOne(booking)
                const id = result.insertedId;
                const sendData = await bookingCollection.findOne({ _id: ObjectId(id) })
                return res.send({ success: true, booking: sendData })
            }
        })


        // get single booking
        app.get('/bookings/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const booking = await bookingCollection.findOne({ _id: ObjectId(id) })
            res.send(booking)
        })


        // put user information
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            console.log(email)
            const user = req.body;
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.DP_JWT_SECRET, { expiresIn: '1d' })
            res.send({ result, token });

        })

        // add admin role
        app.put('/users/admin/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' }
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            return res.send(result);

        })


        // get available services
        app.get('/available', async (req, res) => {
            const date = req.query.date;
            const services = await serviceCollection.find().toArray();
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatmentName === service.name);
                const booked = serviceBooking.map(s => s.slot)
                service.available = service.slots.filter(s => !booked.includes(s))
            })
            res.send(services);
        })


        // get appoinment data
        app.get('/appoinment', verifyJwt, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (decodedEmail === email) {
                const bookings = await bookingCollection.find({ email: email }).toArray();
                return res.send(bookings)
            } else {
                return res.status(403).send({ message: 'Forbidden' })
            }
        })


        // get admin access
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        // get all users
        app.get('/users', verifyJwt, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        // post doctor to database 
        app.post('/doctors', verifyJwt, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        })

        // get doctors data
        app.get('/doctors', verifyJwt, verifyAdmin, async (req, res) => {
            const result = await doctorCollection.find({}).toArray()
            res.send(result)
        })

        // delete a doctor
        app.delete('/doctors/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const result = await doctorCollection.deleteOne({ email: email })
            res.send(result)
        })

        // stripe payment intent api
        app.post('/payment-intent', verifyJwt, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        })

        // update bookings
        app.patch('/bookings/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const body = req.body
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transectionId: body.transectionId,
                    amount: body.amount
                }
            }
            const result = await bookingCollection.updateOne(filter, updatedDoc)
            const payments = await paymentCollection.insertOne(updatedDoc)
            res.send(result)
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