exports.guid = guid;
exports.mapStepWidth = mapStepWidth;


function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
    });
}

function mapStepWidth(stepWidth) {
    console.log("stepWidth", stepWidth);
    if (stepWidth <= 50) {
        return Math.ceil(stepWidth/10)*10;
    }
    if (stepWidth <= 100) {
        return Math.ceil(stepWidth/50)*50;
    }
    if (stepWidth <= 500) {
        return Math.ceil(stepWidth/100)*100;
    }
    return Math.round(stepWidth/1000)*1000;
}
