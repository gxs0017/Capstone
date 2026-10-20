// backend/controllers/ProfilePictureController.js
const User = require('../models/User');

//UPLOAD AND REMOVE PROFILE PICTURE
 
//REFERENCES: 
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function?utm_source
//https://stackoverflow.com/questions/47110048/multer-file-filename-and-file-path-undefined

// ----------------------------------------------------------------
// POST /api/auth/profile-picture  (protected — upload profile picture)
// ----------------------------------------------------------------
const uploadProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({result: 'Please select an image to upload!' });
        }

        //path of picture to store in the db 
        const Path = `/uploads/profile-pictures/${req.file.filename}`;

        await User.updateProfilePicture(req.user.id, Path);

        return res.status(200).json({result: 'Profile picture uploaded successfully!',
           
            profilePicture: Path
            
        });

    } catch (error) {
        return res.status(500).json({
          
            result: 'Failed to upload profile picture!'
        });
    }
};

// ----------------------------------------------------------------
// DELETE /api/auth/profile-picture  (protected — remove profile picture)
// ----------------------------------------------------------------
const removeProfilePicture = async (req, res) => {
    try {
        await User.updateProfilePicture(req.user.id, null);

        return res.status(200).json({
            result: 'Profile picture removed successfully!',
         
            profilePicture: null
        });

    } catch (error) {
        return res.status(500).json({    result: 'Failed to remove profile picture!'  });
    }
};

module.exports = { uploadProfilePicture, removeProfilePicture };