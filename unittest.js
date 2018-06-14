var sandbox = require('nodeunit').utils.sandbox;

var boxGlobals = {
	// Passing module.exports into the sandbox will give your code access to it.
	module : {
		exports : exports
	},
	// Passing require into the sandbox will give your code access to use it AND
	// will share the cache with modules already required from outside the
	// sandbox.
	require : require,
	// Passing console into the sandbox will give your code access to it
	console : console
};
var owlsb = sandbox('owlcalendar.js', boxGlobals);

exports.testFilteredTeams = function(test) {
	var params = {
		teams : "blah,foo"
	};
	var ft = owlsb.getFilteredTeams(params);
	test.expect(3);
	test.ok(ft.length == 2, "Expected 2 teams in returned params");
	test.equal(ft[0], "blah");
	test.equal(ft[1], "foo");
	test.done();
};

exports.testParseParamsWithTeamsFormatAndScores = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar?teams=BOS,FLA,LDN&format=detailed&scores=show"};
	var params = owlsb.params(req);
	var options = owlsb.createOptionsFromPars(params);
	
	test.expect(3);
	test.ok(!options.showAllTeams(), "Should not show all teams.");
	test.ok(options.showScores(), "Should show scores.");
	test.ok(options.showDetailedSummary(), "Should show detailed summary.");
	test.done();
};

exports.testDetailedSummaryForPlayoffsKnowingOneTeam = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar?format=detailed&scores=show"};
	var params = owlsb.params(req);
	var options = owlsb.createOptionsFromPars(params);
	var stageName = "Test stage";
	
	var match = {
			state: "OPEN",
			tournament: { type: "PLAYOFFS" }
	};
	
	var comps = [
		{ abbreviatedName: "LON", name: "London Spitfire" },
	];
		
	var summary = owlsb.getMatchSummaryString(options, stageName, match, null, comps[0]);
	
	test.expect(1);
	test.equals(summary, "Test stage Playoffs - TBA vs London Spitfire", "TBA vs LON for Playoffs");
	test.done();
};

exports.testDetailedSummaryForPlayoffsKnowingNoTeams = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar?format=detailed&scores=show"};
	var params = owlsb.params(req);
	var options = owlsb.createOptionsFromPars(params);
	var stageName = "Test stage";
	
	var match = {
			state: "OPEN",
			tournament: { type: "PLAYOFFS" }
	};
	
	var summary = owlsb.getMatchSummaryString(options, stageName, match, null, null);
	
	test.expect(1);
	test.equals(summary, "Test stage Playoffs - TBA vs TBA", "TBA v TBA for Playoffs");
	test.done();
};

exports.testSummaryInDetailedWithScores = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar?teams=BOS,FLA,LDN&format=detailed&scores=show"};
	var params = owlsb.params(req);
	var options = owlsb.createOptionsFromPars(params);
	var stageName = "Test stage";
	
	var comps = [
		{ abbreviatedName: "FLA", name: "Florida Mayhem" },
		{ abbreviatedName: "BOS", name: "Boston Uprising" }
	];

	var match = {
		state: "CONCLUDED",
		winner: { abbreviatedName: comps[1].abbreviatedName },
		scores: [ { value: "1" }, { value: "3"} ],
		tournament: { type: "OPEN" }
	};
	
	var summary = owlsb.getMatchSummaryString(options, stageName, match, comps[0], comps[1]);
	
	test.expect(1);
	test.equals(summary, "Test stage - Boston Uprising [3] d Florida Mayhem [1]", "Should show Boston d Florida 3-1");
	test.done();
};