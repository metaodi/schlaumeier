var os = require('os');
var fs = require('fs');
var path = require('path');
var Request = require('superagent');
var Stream = require('stream');
var _ = require('underscore');
var Canvas = require('canvas');
var Chart = require('nchart');

exports.hello = hello;
exports.info = info;
exports.didNotUnderstand = didNotUnderstand;

function answer(bot, message, answer) {
    console.log(message.ts, answer);
    return bot.reply(message, answer, function(err) {
        console.log("Slack API Callback error: " + err);
    });
}

function info(bot, message, data) {
    var re = new RegExp("(infos|fakt(en)?)?( (zu|über))? (.*)", "i");
    var matches = re.exec(message.text);

    console.dir(matches);

    if (!matches || matches.length < 6) {
        return didNotUnderstand(bot, message);
    }

    var locationText = matches[5];
    var addressRecord;
    var wbev, wbevRecords, wohnBevSum, rkSum, evSum, andereSum;
    try {
        addressRecord = data.addresses({'adresse': {likenocase: locationText}}).first();
    } catch (e) {
        answer(bot, message, "Sorry, Adresse/Ort '" + locationText + "' nicht gefunden");
        return;
    }
    try {
        wbev = data.wbev(
            {'stat_zone_sort': {"==": addressRecord.statistischezone}},
            {'jahr': {"==": 2015}}
        );
        wbevRecords = wbev.get();

        wohnBevSum = wbev.sum("anzahl");
        rkSum = wbev.filter({'kon_ogd_kurz': {'==': 'RK'}}).sum("anzahl");
        evSum = wbev.filter({'kon_ogd_kurz': {'==': 'EV-REF'}}).sum("anzahl");
        andereSum = wbev.filter({'kon_ogd_kurz': {'==': 'andere Konf.'}}).sum("anzahl");
    } catch (e) {
        answer(bot, message, "Fehler: " + e);
        return;
    }

    answer(bot, message, "Wohnbevölkerung in der statistischen Zone " + wbevRecords[0].stat_zone_name + " in 2015: *" + wohnBevSum + "*\n:purple_heart:Röm. Kath. " + rkSum + " :green_heart: Evangelisch " + evSum + " :yellow_heart: Andere " + andereSum );

    var chartData = [
        {
            value: rkSum,
            color: "#BE72D6",
            label: "Römisch Katholisch"
        },
        {
            value: evSum,
            color: "#48C732",
            label: "Evangelisch Reformiert"
        },
        {
            value: andereSum,
            color: "#F9E744",
            label: "Andere"
        }
    ];

    var canvas = new Canvas(600, 450);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var chart = new Chart(ctx)
        .Pie(
            chartData,
            {
                scaleShowValues: true,
                scaleFontSize: 24
            }
         );

    var filepath = path.join(__dirname, '..', 'data', guid() + '.png');
    canvas.toBuffer(function (err, buf) {
        if (err) {
            throw err;
        }
        fs.writeFileSync(filepath, buf);

        console.log(message.channel);
        bot.api.files.upload({
            token: process.env.token,
            file: fs.createReadStream(filepath),
            filename: 'Konfessionszugehörigkeit',
            filetype: 'png',
            channels: message.channel
        }, function(err, res) {
            if (err) {
                console.log("Failed to add chart: ", err);
            }
        });
    });
}

function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
    });
}

function hello(bot, message) {
    var msg = ':robot_face: Ich bin ein Bot namens<@' + bot.identity.name + '>. Hallo <@' + message.user + '>!'; 
    answer(bot, message, msg);
}

function didNotUnderstand(bot, message) {
    var msg = 'Sorry, das habe ich leider nicht verstanden. Ich bin ein Bot und kann dir interessante Fakten über Orte in Zürich erzählen (z.B. _infos über viaduktstrasse_).' + "\n";
    answer(bot, message, msg);
}


// string -> lat/lon (http://nominatim.openstreetmap.org/search/impact hub zürich?format=json)
