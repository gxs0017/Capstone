const User = require('../models/User');
const bcrypt = require('bcryptjs');

const registerUser = async (req, res) => {
    try {
        const { firstName, lastName, dateOfBirth, email, password, phoneNumber, address, role, services } = req.body; 
        
        const existingUser = await User.findOne({ email: email });
        
        if (existingUser) {
            return res.status(400).json({ message: "User with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            firstName,
            lastName,
            dateOfBirth,
            email,
            password: hashedPassword,
            phoneNumber,
            address,
            role,
            services
        });

        await newUser.save();

        res.status(201).json({
            message: "User registered successfully!",
            userID: newUser._id
        });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server error during registration", error: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = await User.find({});
        res.status(200).json(users);       
    } catch (error) {
        res.status(500).json({ message: "Error fetching data", error: error.message });
    }
};

module.exports = { registerUser, getUsers };