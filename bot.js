var express = require('express');
var TAFFY = require("taffy");
var Botkit = require('botkit');
var _ = require('lodash');
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

var Converter = require("csvtojson").Converter;
var csvConverter = new Converter({'delimiter': ';'});

var data = {};

data.addresses = null
csvConverter.fromFile('./data/adressen.csv', function(err, jsonObj) {
    console.log("Error: ", err);
    var mapped = _.map(jsonObj, function(address) {
        return _.mapKeys(address, function(val, key) {
            return key.toLowerCase();
        });
    });
    data.addresses = TAFFY(mapped);
    console.log(data.addresses().get());
    console.log("Finished parsing adresses CSV");
});

data.wbev = null;
var wbevConverter = new Converter({delimiter: ','});
wbevConverter.fromFile('./data/bevbestandjahradminsherkunftreligion.csv', function(err, jsonObj) {
    console.log("Error: ", err);
    var mapped = _.map(jsonObj, function(bev) {
        var lower =  _.mapKeys(bev, function(val, key) {
            return key.toLowerCase();
        });

        lower['jahr'] = lower['stichtagdatjahr'];
        lower['stat_zone_sort'] = lower['statzonesort'];
        lower['stat_zone_name'] = lower['statzonelang'];
        lower['quariert_sort'] = lower['quarsort']
        lower['quariert_name'] = lower['quarlang']
        lower['kreis_sort'] = lower['kreissort']
        lower['herkunf_sort'] = lower['herkunftsort'];
        lower['is_ch'] = (lower['herkunf_sort'] === 1);
        lower['kon_ogd_sort'] = lower['konogdsort'];
        lower['kon_ogd_kurz'] = lower['konogdkurz'];
        lower['anzahl'] = lower['anzbestwir'];

        delete lower['stichtagdatjahr'];
        delete lower['statzonesort'];
        delete lower['statzonelang'];
        delete lower['quarsort']
        delete lower['quarlang']
        delete lower['kreissort']
        delete lower['herkunftsort'];
        delete lower['konogdsort'];
        delete lower['konogdkurz'];
        delete lower['anzbestwir'];

        return lower;
    });
    data.wbev = TAFFY(mapped);
    console.log(data.wbev().get());
    console.log("Finished parsing wbev CSV");
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
        var matched = _.some(request.pattern, matcher(message.text));
        if (matched) {
            request.answerFn(bot, message, data);
            return false; //break out of every()
        }
        return true; // continue with next requestConfig
    });
    if (noAnswer) {
        answers.didNotUnderstand(bot, message);
    }
});


// the schlaumeier API
var app = express();

// Enable CORS so that we can actually use the server for something useful.
app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

app.get('/address/:address?', function(req, res) {
    try {
        var result = {"result": data.addresses().get() };
        console.log("req.params.address:", req.params.address);
        if (req.params.address) {
    	    result.result = data.addresses({'adresse': {likenocase: req.params.address}}).get();
        } 
    	res.json(result);
    } catch (ex) {
        res.status(500).send("The query could not be executed.");
    }
});

app.get('/wbev/:statzone?', function(req, res) {
    try {
        var result = data.wbev();
        console.log("req.params.statzone:", req.params.statzone);
        console.log("req.query.jahr:", req.query.jahr);
        if (req.params.statzone) {
    	    result = data.wbev({'stat_zone_sort': {"==": req.params.statzone}});
        } 
        if (req.query.jahr) {
            result = result.filter({"jahr": {"==": req.query.jahr}});
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
