const express =  require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser')
const server = new express();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/bizzy-raf');
server.use(cors());
server.use(bodyParser());

const Users = mongoose.model('User', {
    firstName: String,
    lastName: String,
    email: {
        type:String,
        unique: true
    },
    score: {
        default: 0,
        type: Number
    },
});

const Refers = mongoose.model('Ref', {
    email: {
        type: String,
        unique: true,
    },
    invitedBy: String,
});

const unique = (input) => {
    var seen = {};
    return input.filter(function(item) {
        return seen.hasOwnProperty(item) ? false : (seen[item] = true);
    });
}


server.get('/', (r, res) => { return res.send('<img src="https://i.imgur.com/DzfVJox.gif"/>')});

server.get('/highscores', async (req, res) => {
    try {
        const users = await Users.find({}, ['firstName', 'lastName','score'], { sort: { score: -1 }, limit: 50 });
        res.json(users);
    } catch (error) {
        console.log(error);
        res.status(400).json({
            error: 'Something went wrong.'
        });
    }
});

server.post('/refers', async (req, res) => {
    try {
        if (
            !req.body ||
            !req.body.email ||
            !(req.body.rafEmails && typeof(req.body.rafEmails) !== 'Object' && req.body.rafEmails.length) ||
            !req.body.firstName
        ) {
            res.status(400).json({
                success:false,
                error: 'Bad Request'
            });
        }
    
        // create or update user
        const userData = {firstName: req.body.firstName, lastName: req.body.lastName, email: req.body.email};
        const user = await Users.findOneAndUpdate(
            { email: userData.email },
            userData,
            { upsert: true, setDefaultsOnInsert: true, new: true }
        );

        let excludes = await Refers.find({
            'email': { $in: req.body.rafEmails}
        });
        excludes = excludes.map(data => data.email);
    
        const data = unique(req.body.rafEmails).map((email) => {
            if (excludes.includes(email)) {
                return false;
            }
            return {
                email, invitedBy:userData.email
            };
        }).filter(bool => bool);
    
        if (data.length){
            await Refers.collection.insertMany(data);
        }
    
        user.score += data.length;
        await user.save();
    
        res.json({
            success: true,
            added: data.length,
            user: {
                score: user.score,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
            },
            invited: data.map(d => d.email),
            notInvited: excludes,
        });
    } catch(error) {
        console.log(error);
        res.status(400).json({
            error: 'Something went wrong.'
        });
    }
    
});

server.listen(process.env.PORT || 9332);