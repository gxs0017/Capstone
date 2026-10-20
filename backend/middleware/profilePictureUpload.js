    //Sources: 
    //https://github.com/expressjs/multer
    //https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
    //https://www.npmjs.com/package/multer
    //https://nodejs.org/api/fs.html?

    // backend/middleware/profilePictureUpload.js
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');

    //Currnt folder to upload image
    const uploadFolder = path.join(__dirname, '../uploads/profile-pictures');
    fs.mkdirSync(uploadFolder, { recursive: true });

    // Multer storage configuration
    const storage = multer.diskStorage({
        destination: (req, file, done) => {  done(null, uploadFolder); },

        filename: (req, file, done) => {
            const extension = path.extname(file.originalname).toLowerCase();
            done(null, `${req.user.id}-${Date.now()}${extension}`);
        }
    });
        //declare KB amount and append to Image sizing
        const KB = 1024;
        const maxImageSize = 2 * KB * KB;

    // Multer upload configuration
    const uploadProfilePicture = multer({
        storage,  limits: { fileSize: maxImageSize },
        
        fileFilter: (req, file, done) => {
            const AllowedImages = ['image/jpeg', 'image/png'],  Acceptedformat = ['.jpg', '.jpeg', '.png'];

            if ( // Check file properties
                AllowedImages.includes(file.mimetype) && Acceptedformat.includes(path.extname(file.originalname).toLowerCase())
            ) {
                done(null, true);
            } 

            // Reject GIFs or other files that are not JPG, JPEG, or PNG
        else {
             done(new Error('Only JPG, JPEG, and PNG images are allowed!'));
}
        }
    });

    //  middleware
    module.exports = uploadProfilePicture;