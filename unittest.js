var sandbox = require('nodeunit').utils.sandbox;

var boxGlobals = {
    // Passing module.exports into the sandbox will give your code  access to it.
    module: {exports: exports},
    // Passing require into the sandbox will give your code  access to use it AND
    // will share the cache with modules already required from outside the sandbox.
    require: require,
    // Passing console into the sandbox will give your code access to it
    console: console
};
var owlsb = sandbox('owlcalendar.js', boxGlobals);

exports.testFilteredTeams = function(test) {
        var params = {teams: "blah,foo"};
        var ft = owlsb.getFilteredTeams(params);
        test.expect(1);
        test.ok(ft.length == 2, "Expected 2 teams in returned params");
        test.done();
};
