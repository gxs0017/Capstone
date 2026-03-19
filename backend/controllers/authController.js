const User = require('../models/User');
const bcrypt = require('bcryptjs');

const registerUser = async (request, response) => {

    try{
       const { firstName, lastName, dateOfBirth, email, password, address, role, services } = req.body; 
       const existingUser = await User.findOne({ email: email});
       if (existingUser){
        return response.status(400).json({ message: "User with this email already exists." });

       }

       const salt = await bcrypt.genSalt(10);
       const hashedPassword = await bcrypt.hash(password, salt);

       const newUser = new User({
            firstName,
            lastName,
            dateOfBirth,
            email,
            password: hashedPassword, 
            address,
            role,
            services
        });

        await newUser.save();

        response.status(201).json({
            message: "User registered successfully !",
            userID: newUser._id
        });
    } 
    catch (error) {
        console.error("Registration Error:", error);
        response.status(500).json({ message: "Server error during registration", error: error.message });
    }
}; f

module.exports = {registerUser}