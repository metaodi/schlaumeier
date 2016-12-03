var os = require('os');
var Request = require('superagent');
var _ = require('underscore');

exports.hello = hello;
exports.info = info;
exports.didNotUnderstand = didNotUnderstand;

function answer(bot, message, answer) {
    console.log(message.ts, answer);
    return bot.reply(message, answer, function(err) {
        console.log("Slack API Callback error: " + err);
    });
}

function info(bot, message) {
    var re = new RegExp("(infos|fakt(en)?)?( (zu|über))? (.*)", "i");
    var matches = re.exec(message.text);


    console.dir(matches);

    if (!matches || matches.length < 6) {
        return didNotUnderstand(bot, message);
    }

    var locationText = matches[5];
    Request
        .get('https://schlaumeier.localtunnel.me/address/' + locationText)
        .end(function(err, res) {
            if (err) {
                answer(bot, message, 'Fehler: ' + err);
                return;
            }
            console.log(res.text);
            console.log(res.body);
            try {
                var result = res.body.result[0];
                var lat = result.Northing_WGS;
                var lon = result.Easting_WGS;
                var statZone = result.StatistischeZone;
            } catch (e) {
                answer(bot, message, 'Fehler: ' + err);
                return;
            }
            answer(bot, message, "Lat/Lon: " + lat + "/" + lon + ", Statistische Zone: " + statZone);
            Request
                .get('https://schlaumeier.localtunnel.me/wbev/' + statZone + '?year=2015')
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

                    answer(bot, message, "Wohnbevölkerung in der statistischen Zone " + res.body.result[0].StatZoneLang + ": " + wohnBev + ' (Röm. Kath. ' + rkBev.AnzBestWir + ", Evangelisch " + evBev.AnzBestWir + ", Andere " + andereBev.AnzBestWir + ")");
                });
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
