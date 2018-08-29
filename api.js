const express =  require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser')
const server = new express();
const mailchimp = require('mailchimp-api-v3')
 
var mc = new mailchimp(process.env.BIZZY_MC);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/bizzy-raf');
server.use(cors());
server.use(bodyParser());

const addToList = async (u ,list = process.env.BIZZY_LIST) => {
    return mc.post(`/lists/${list}/members`, {
        email_address: u.email,
        status: 'subscribed',
        merge_fields: {
            FNAMe: u.firstName || '',
            LNAME: u.lastName || '',
            TYPE: u.type || '',
        }
    });
}

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
    type: {
        type: String,
        enum: ['raf', 'early-access']
    }
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
        const counts = {
            raf: await Users.count({type: 'raf'}),
            ea: await Users.count({type: 'early-access'})
        };

        const users = await Users.find({}, ['firstName', 'lastName','score'], { sort: { score: -1 }, limit: 50 });
        res.json({counts, users});
    } catch (error) {
        console.log(error);
        res.status(400).json({
            error: 'Something went wrong.'
        });
    }
});

// less complicated function
server.post('/users', async (req, res) => {
    try {
        if (
            !req.body ||
            !req.body.email
        ) {
           throw 'Email is required';
        }
    
        const data = {
            email: req.body.email,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            type: 'early-access'
        };
    
        const u = await Users.findOne({
            email: data.email
        });
    
        if (u) {
            throw ('Email is already signed up for Early Access')
        }

        const user = new Users(data);
        await user.save();

        await addToList(data);

        res.json({success:true, user});
    } catch (error) {
        console.log(error)
        res.status(400).json({
            success:false,
            error: error || 'server error.'
        });
    }
});

// more complicated function
server.post('/refers', async (req, res) => {
    try {
        if (
            !req.body ||
            !req.body.email ||
            !(req.body.rafEmails && typeof(req.body.rafEmails) !== 'Object' && req.body.rafEmails.length) ||
            !req.body.firstName
        ) {
           throw('Bad Request');
        }
    
        // create or update user
        const userData = {firstName: req.body.firstName, lastName: req.body.lastName, email: req.body.email, type: 'raf'};
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

        await addToList(userData);
    
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
            success: false,
            error
        });
    }
    
});

server.listen(process.env.PORT || 9332);