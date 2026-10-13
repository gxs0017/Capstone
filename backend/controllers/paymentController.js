// Created by Broinson Jeyarajah
// Student Number: 991568803

//-------REFERENCES USED---------
// https://docs.stripe.com/metadata
// https://docs.stripe.com/api/payment_intents/create
// https://docs.stripe.com/api/payment_intents/retrieve
// https://docs.stripe.com/keys
// Previous course/lecture material – Database and SQL

// backend/controllers/paymentController.js
// controllers/paymentController.js
// Payment operations for requesters (create payment intent, confirm payment).
const Stripe = require('stripe');
const pool = require('../config/db');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { logAction } = require('../models/AuditLog');


// ----------------------------------------------------------------
// POST /api/auth/payments — create a Stripe payment intent for a booking
// Body: { bookingId }
// ---------------------------------------------------------------- 
 const createPaymentIntent = async (req, res) => {
     try {
         const { bookingId } = req.body;
         const amount = Number(process.env.STRIPE_TEST_AMOUNT_CENTS);


         if (!Number.isInteger(amount)) { 
                return res.status(500).json({ message: 'Payment amount is invalid.' });
         } 
         
          else if(amount < 50) {
               return res.status(500).json({ message: 'Payment amount is invalid.' });
         }

         // Check if the booking exists and is unpaid
         const [bookings] = await pool.execute(
             `SELECT booking_id FROM bookings
               WHERE booking_id = ?
               AND requester_id = ?
               AND status IN ('PENDING', 'CONFIRMED')
              AND payment_status = 'UNPAID'`,
             [bookingId, req.user.id]
         );

         if (bookings.length === 0) {
            return res.status(404).json({ message: 'Booking not found or cannot be paid.' });
         }

         const paymentIntent = await stripe.paymentIntents.create({
             amount,
             currency: 'cad',
              payment_method_types: ['card'],
             description: `Booking payment #${bookingId}`,
            
             // Attach bookingId and requesterId as metadata for later verification
              metadata: {bookingId: String(bookingId), requesterId: String(req.user.id),
            },
         });

         // Log the action for auditing
         logAction(req.user.id, 'PAYMENT_INTENT_CREATED', 'booking: ' + bookingId, req.ip);

         return res.status(201).json({
             paymentIntentId: paymentIntent.id,
              clientSecret: paymentIntent.client_secret,
              amount: paymentIntent.amount,
             currency: paymentIntent.currency,  //CURRENCY
         });

     } catch (err) {
         console.error('createPaymentIntent error:', err);
         return res.status(500).json({ message: 'Error creating payment intent.' });
     }
 };

 // ----------------------------------------------------------------
 // POST /api/auth/payments/confirm — confirm Stripe payment
 // Body: { bookingId, paymentIntentId }
 // ----------------------------------------------------------------
 const confirmPayment = async (req, res) => {
     try {
         const { bookingId, paymentIntentId } = req.body;

         if (!bookingId || !paymentIntentId) {
              return res.status(400).json({ message: 'Booking ID and payment intent ID are required properties' });
         }
 
         const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
 
         // Check if that payment belongs to this booking and user
         // https://docs.stripe.com/metadata
         if(paymentIntent.metadata.bookingId !== String(bookingId) || paymentIntent.metadata.requesterId !== String(req.user.id)
         )

         {
             return res.status(403).json({ message: 'Payment not matched with this specific booking.' });
         }

         if (paymentIntent.status !== 'succeeded') 
            {
             return res.status(400).json({ message: 'Payment has not been completed.' });
        }

         //Payments saved in DB 
         await pool.execute(
             `UPDATE bookings
              SET payment_status = 'PAID',
                  payment_method = 'STRIPE',
                  stripe_payment_intent_id = ?
              WHERE booking_id = ?
              AND requester_id = ?`,

              // Update the booking to mark it as paid
             [paymentIntent.id, bookingId, req.user.id]
         );

         return res.json({
             message: 'Payment confirmed successfully.',
              paymentStatus: 'PAID',
         });

     } 
     catch (err) {
          console.error('confirmPayment error:', err);
           return res.status(500).json({ message: 'Error confirming payment.' });
     }
 };

 module.exports = { createPaymentIntent, confirmPayment };
