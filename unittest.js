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

exports.testParseWithNoParamsWithTeamsFormatAndScores = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar"};
	var params = owlsb.params(req);
	var options = owlsb.createOptionsFromPars(params);
	
	test.expect(3);
	test.ok(options.showAllTeams(), "Should not show all teams.");
	test.ok(!options.showScores(), "Should show scores.");
	test.ok(!options.showDetailedSummary(), "Should not show detailed summary.");
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
	test.equals(summary, "Test stage Playoffs - TBA vs TBA", "TBA vs TBA for Playoffs");
	test.done();
};

exports.testShortSummaryForPlayoffsKnowingNoTeams = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar"};
	var params = owlsb.params(req);
	var options = owlsb.createOptionsFromPars(params);
	var stageName = "Test stage";
	
	var match = {
			state: "OPEN",
			tournament: { type: "PLAYOFFS" }
	};
	
	var summary = owlsb.getMatchSummaryString(options, stageName, match, null, null);
	
	test.expect(1);
	test.equals(summary, "OWL TBA v TBA", "TBA v TBA");
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

exports.testSummaryInShortformWithScores = function(test) {
	var req = {url: "http://owl.tjsr.id.au/calendar?scores=show"};
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
	test.equals(summary, "OWL BOS [3] d FLA [1]", "Should show BOS d FLA 3-1");
	test.done();
};

exports.testOverdueCompleteMatch = function(test) {
	var timeNow = new Date();
	var timeNowUTC = new Date(timeNow.toUTCString());
	var epochNow = timeNowUTC.getTime();
	
	var match = {
		state: "PENDING",
		endDateTS: epochNow - 3600000
	};
	
	var due = owlsb.dueForFinish(match);
	test.expect(1);
	test.ok(due, "Should be marked as overdue for being finished.");
	test.done();
}

exports.testIncompleteMatch = function(test) {
	var timeNow = new Date();
	var timeNowUTC = new Date(timeNow.toUTCString());
	var epochNow = timeNowUTC.getTime();
	
	var match = {
			state: "PENDING",
			endDateTS: epochNow + 3600000
	};
	
	var due = owlsb.dueForFinish(match);
	test.expect(1);
	test.ok(!due, "Should not be marked as overdue for being finished.");
	test.done();
}

exports.testEarliestMatch = function(test) {
	var matches = [
		{ endDateTS: 5000 },
		{ endDateTS: 4500 },
		{ endDateTS: 5500 },
		{ endDateTS: 6000 },
		{ endDateTS: 5800 }
	];
	
	var earliest = owlsb.getEarliestMatchTime(matches);
	
	test.expect(1);
	test.ok(earliest == 4500, "Earliest value should be 4500, was " + earliest);
	test.done();
}