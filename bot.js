var express = require('express');
var TAFFY = require("taffy");
var Botkit = require('botkit');
var _ = require('underscore');
var controller = Botkit.slackbot();
var answers = require('./lib/answers');

var tokens = process.env.token.split(" ");
_.each(tokens, function(token) {
    var bot = controller.spawn({
      token: token
    });
    bot.startRTM(function(err,bot,payload) {
      if (err) {
        console.log(err);
        throw new Error('Could not connect to Slack');
      }
    });
});

function matcher(text) {
    return function(pattern) {
        var re = new RegExp(pattern, 'i');
        return re.test(text);
    };
}

var requestConfig = [
    {
        'pattern': ['Info', 'fakten'],
        'answerFn': answers.info
    },
    {
        'pattern': ['hi', 'hello', 'hey'],
        'answerFn': answers.hello
    }
];


controller.hears(['.*'], ['direct_message,direct_mention'], function(bot, message) {
    console.log("Bot heard message (" + message.ts + "): " + message.text);
    var noAnswer = _.every(requestConfig, function(request) {
        var matched = _.any(request.pattern, matcher(message.text));
        if (matched) {
            request.answerFn(bot, message);
            return false; //break out of every()
        }
        return true; // continue with next requestConfig
    });
    if (noAnswer) {
        answers.didNotUnderstand(bot, message);
    }
});


// the address API
var app = express();

// Enable CORS so that we can actually use the server for something useful.
app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

var Converter = require("csvtojson").Converter;
var csvConverter = new Converter({'delimiter': ';'});

var addresses = null;
csvConverter.fromFile('./data/adressen.csv', function(err, jsonObj) {
    console.log("Error: ", err);
    addresses = TAFFY(jsonObj);
    console.log(addresses().get());
    console.log("Finished parsing adresses CSV");
});

var wbev = null;
var wbevConverter = new Converter({delimiter: ','});
wbevConverter.fromFile('./data/bevbestandjahradminsherkunftreligion.csv', function(err, jsonObj) {
    console.log("Error: ", err);
    wbev = TAFFY(jsonObj);
    console.log(wbev().get());
    console.log("Finished parsing wbev CSV");
});


app.get('/address/:address?', function(req, res) {
    try {
        var result = {"result": addresses().get() };
        console.log("req.params.address:", req.params.address);
        if (req.params.address) {
    	    result.result = addresses({'Adresse': {likenocase: req.params.address}}).get();
        } 
    	res.json(result);
    } catch (ex) {
        res.status(500).send("The query could not be executed.");
    }
});

app.get('/wbev/:statzone?', function(req, res) {
    try {
        var result = wbev();
        console.log("req.params.statzone:", req.params.statzone);
        console.log("req.query.year:", req.query.year);
        if (req.params.statzone) {
    	    result = wbev({'StatZoneSort': {"==": req.params.statzone}});
        } 
        if (req.query.year) {
            result = result.filter({"StichtagDatJahr": {"==": req.query.year}});
        }
    	res.json({"result": result.get() });
    } catch (ex) {
        res.status(500).send("The query could not be executed.");
    }
});

app.get('/', function(req, res) {
	res.status(200).send("The dyno is awake");
});

var server = app.listen(process.env.PORT || 5000, function() {
  console.log('Listening on port %d', server.address().port);
});
