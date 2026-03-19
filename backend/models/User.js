const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true },
    password: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        province: { type: String, required: true },
        postalCode: { type: String, required: true }
    },
    role: {
        type: String,
        enum: ['PROVIDER', 'REQUESTER'],
        required: true
    },
    services: [{ type: String }]
}, 
{ timestamps: true });

module.exports = mongoose.model('User', userSchema);