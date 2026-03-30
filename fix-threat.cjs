const fs = require('fs');
const files = ['adventure/adventure-actions.js', 'adventure/spell-cast-helpers.js'];
files.forEach(f => {
    let data = fs.readFileSync(f, 'utf8');
    data = data.replace(/actingPlayerState\.threat \+= ([^;]+);/g, 'actingPlayerState.threat = Math.min(10, (actingPlayerState.threat || 0) + $1);');
    fs.writeFileSync(f, data);
    console.log('Fixed ' + f);
});