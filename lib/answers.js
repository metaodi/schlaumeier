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

function info(bot, message, token) {
    var re = new RegExp("(infos|fakt(en)?)?( (zu|über))? (.*)", "i");
    var matches = re.exec(message.text);


    console.dir(matches);

    if (!matches || matches.length < 6) {
        return didNotUnderstand(bot, message);
    }

    var locationText = matches[5];
    Request
        .get('https://schlaumeier.herokuapp.com/address/' + locationText)
        .end(function(err, res) {
            if (err) {
                answer(bot, message, 'Fehler: ' + err);
                return;
            }
            console.log(res.text);
            console.log(res.body);
            var lat, lon, statZone;
            try {
                var result = res.body.result[0];
                lat = result.Northing_WGS;
                lon = result.Easting_WGS;
                statZone = result.StatistischeZone;
            } catch (e) {
                answer(bot, message, 'Fehler: ' + err);
                return;
            }
            Request
                .get('https://schlaumeier.herokuapp.com/wbev/' + statZone + '?year=2015')
                .end(function(err, res) {
                    if (err || res.body.result.length === 0) {
                        answer(bot, message, 'Fehler: ' + err);
                        return;
                    }
                    console.log(res.body);

                    var wohnBev = _.reduce(res.body.result, function(memo, wbev) {
                        return memo + wbev.AnzBestWir;
                    }, 0);

                    var rkBev = _.find(res.body.result, function(wbev) {
                        return wbev.KonOGDKurz === 'RK';
                    });
                    var evBev = _.find(res.body.result, function(wbev) {
                        return wbev.KonOGDKurz === 'EV-REF';
                    });
                    var andereBev = _.find(res.body.result, function(wbev) {
                        return wbev.KonOGDKurz === 'andere Konf.';
                    });

                    answer(bot, message, "Wohnbevölkerung in der statistischen Zone " + res.body.result[0].StatZoneLang + ": " + wohnBev + "\n:purple_heart:Röm. Kath. " + rkBev.AnzBestWir + " :green_heart: Evangelisch " + evBev.AnzBestWir + " :yellow_heart: Andere " + andereBev.AnzBestWir );

                    var data = [
                        {
                            value: rkBev.AnzBestWir,
                            color: "#BE72D6",
                            label: "Römisch Katholisch"
                        },
                        {
                            value: evBev.AnzBestWir,
                            color: "#48C732",
                            label: "Evangelisch Reformiert"
                        },
                        {
                            value: andereBev.AnzBestWir,
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
                            data,
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
              });
        });


}

function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
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
