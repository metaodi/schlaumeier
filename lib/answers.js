var os = require('os');
var fs = require('fs');
var path = require('path');
var Request = require('superagent');
var Stream = require('stream');
var _ = require('lodash');
var Canvas = require('canvas');
var Chart = require('nchart');
var helper = require('./helper');

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
    var re = new RegExp("(infos|fakt(en)?)?( (zur?|über))? (.*)", "i");
    var matches = re.exec(message.text);

    console.dir(matches);

    if (!matches || matches.length < 6) {
        return didNotUnderstand(bot, message);
    }

    var locationText = matches[5];
    var addressRecord;
    var wbev, wbev2015, wbevRecords, wohnBevSum, rkSum, evSum, andereSum;
    try {
        addressRecord = data.addresses({'adresse': {likenocase: locationText}}).first();
    } catch (e) {
        answer(bot, message, "Sorry, Adresse/Ort '" + locationText + "' nicht gefunden");
        return;
    }
    try {
        wbev = data.wbev(
            {'stat_zone_sort': {"==": addressRecord.statistischezone}}
        );
        wbev2015 = data.wbev(
            {'stat_zone_sort': {"==": addressRecord.statistischezone}},
            {'jahr': {"==": 2015}}
        );
        wbevRecords = wbev.get();

    } catch (e) {
        answer(bot, message, "Fehler: " + e);
        return;
    }
    wohnBevSum = wbev2015.sum("anzahl");
    answer(bot, message, "Wohnbevölkerung in der statistischen Zone _\"" + wbevRecords[0].stat_zone_name + "\"_ in 2015: *" + wohnBevSum + "*");

    // Konfession
    rkSum = wbev2015.filter({'kon_ogd_kurz': {'==': 'RK'}}).sum("anzahl");
    evSum = wbev2015.filter({'kon_ogd_kurz': {'==': 'EV-REF'}}).sum("anzahl");
    andereSum = wbev2015.filter({'kon_ogd_kurz': {'==': 'andere Konf.'}}).sum("anzahl");
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

    var filename = helper.guid() + '.png';
    var filepath = path.join(__dirname, '..', 'data', filename);
    canvas.toBuffer(function (err, buf) {
        if (err) {
            throw err;
        }
        fs.writeFileSync(filepath, buf);

        console.log(message.channel);
        bot.api.files.upload({
            token: process.env.token,
            file: fs.createReadStream(filepath),
            filename: filename,
            title: "Konfessionszugehörigkeit: :purple_heart:Röm. Kath. " + rkSum + " :green_heart:Evangelisch " + evSum + " :yellow_heart:Andere " + andereSum,
            filetype: 'png',
            channels: message.channel
        }, function(err, res) {
            if (err) {
                console.log("Failed to add chart: ", err);
            }
        });
    });

    // Ausländeranteil
    var byYear = _.groupBy(wbevRecords, 'jahr');
    var values = _.map(byYear, function(records) {
        var chRec = _.filter(records, 'is_ch');
        var foreignRec = _.filter(records, ['is_ch', false]);
        var chSum = _.sumBy(chRec, 'anzahl');
        var foreignSum = _.sumBy(foreignRec, 'anzahl');
        return {
            'chSum': chSum,
            'foreignSum': foreignSum
        };
    });
    var chArr = _.map(values, 'chSum');
    var foreignArr = _.map(values, 'foreignSum');
    var lineChartData = {
        labels : _.keys(byYear).sort(),
        datasets : [
            {
                label: "Schweizter",
                fillColor : "rgba(45, 235, 48, 0.0)",
                strokeColor : "rgba(245,45,26,1)",
                pointColor : "rgba(245,45,26,1)",
                pointStrokeColor : "#fff",
                pointHighlightFill : "#fff",
                pointHighlightStroke : "rgba(220,220,220,1)",
                data: chArr
            },
            {
                label: "Ausländer",
                fillColor : "rgba(141, 211, 215, 0.0)",
                strokeColor : "rgba(54,142,239,1)",
                pointColor : "rgba(54,142,239,1)",
                pointStrokeColor : "#fff",
                pointHighlightFill : "#fff",
                pointHighlightStroke : "rgba(151,187,205,1)",
                data: foreignArr
            }
        ]
    };

    canvas = new Canvas(600, 450);
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var minValue = 0;
    var steps = 20; //horizontal
    var maxValue = _.max(chArr.concat(foreignArr));
    var stepWidth = helper.mapStepWidth((maxValue * 1.1 / steps)); // vertical
    chart = new Chart(ctx)
        .Line(
            lineChartData,
            {
                scaleOverlay: true,
                scaleShowLabels: true,
                scaleOverride: true,
                scaleStartValue: minValue,
                scaleSteps: steps,
                scaleStepWidth: stepWidth
            }
         );

    var lineFilename = helper.guid() + '.png';
    var lineFilepath = path.join(__dirname, '..', 'data', lineFilename);
    canvas.toBuffer(function (err, buf) {
        if (err) {
            throw err;
        }
        fs.writeFileSync(lineFilepath, buf);

        console.log(message.channel);
        bot.api.files.upload({
            token: process.env.token,
            file: fs.createReadStream(lineFilepath),
            filename: lineFilename,
            title: 'Entwicklung der Wohnbevölkerung seit 1993: Ausländer:large_blue_circle: und Schweizer:red_circle:',
            filetype: 'png',
            channels: message.channel
        }, function(err, res) {
            if (err) {
                console.log("Failed to add chart: ", err);
            }
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
