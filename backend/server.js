require('dotenv').config();

const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.use(express.json());



mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MONGODB success");
    })
    .catch((error) => {
        console.error("Error in Connection:", error);
    })

app.get('/', (request, response) =>{
    response.send('Welcome to Neighbourhood Help App Home Page');
});

app.listen(5000, () => {
    console.log(" Server is Running perfectly on 5000");

});


app.post('/add-test-user', async (req, res) => {
    try {
        
        const userCollection = mongoose.connection.collection('users');

        const newUser = {
            firstName: "Simran",
            lastName: "Kaur",
            dateOfBirth: "2003-01-01",
            email: "k90@test.com",
            password: "securePassword123",
            phoneNumber:"+1 (777) 177-4567",
            address: {
                street: "1999 Main St",
                city: "Brampton",
                province: "ON",
                postalCode: "H9U 1U5",
            },
            role: "REQUESTER",
            services: [] 
        };

        const result = await userCollection.insertOne(newUser);

        res.status(201).send(" User added successfully with ID: " + result.insertedId);

    } catch (error) {
        
        res.status(500).send(" Failed to add user: " + error.message);
    }
});

