'use strict';

var fs = require('fs');
var icalgen = require('ical-generator');
var calendarData;
var request = require('request');
var getIP = require('ipware')().get_ip;

const cacheHours = 12;
const maxCacheTime = cacheHours * 60 * 60 * 1000;
const calendarCachedFile = 'calendar.json';
const calendarUrl = 'https://api.overwatchleague.com/schedule?expand=team.content&locale=en_US';

const FORMAT_REGULAR = "1";
const FORMAT_DETAILED = "2";
const SHOW_SCORES = "4";
const PARAM_SCORES_SHOW = 'SHOW';
const PARAM_FORMAT_DETAILED = 'DETAILED';

if (!Array.prototype.indexOf) {
	Array.prototype.indexOf = function (obj, fromIndex) {
		if (fromIndex == null) {
			fromIndex = 0;
		} else if (fromIndex < 0) {
			fromIndex = Math.max(0, this.length + fromIndex);
		}
		for (var i = fromIndex, j = this.length; i < j; i++) {
		if (this[i] === obj)
			return i;
		}
		return -1;
	};
}

function readFilesystemCalendar(onCalendarDataLoaded) {
	fs.readFile(calendarCachedFile, 'utf8', function (err, data) {
		if (err) {
			return console.log("Error retrieving " + calendarCachedFile + ": " + err);
		} else {
			console.log("Calendar data retrieved from " + calendarCachedFile);
			calendarData = JSON.parse(data);
			//console.debug("Calling function " + onCalendarDataLoaded); 
			onCalendarDataLoaded(calendarData);
		}
	});
}

exports.getCachedData = function(onCalendarDataLoaded) {
	if (calendarData == null) {
		if (!fs.existsSync(calendarCachedFile)) {
			console.log("Reading remote calendar file from " + calendarUrl);
			request(calendarUrl, function (error, calXhrResponse, body) {
				readFilesystemCalendar(onCalendarDataLoaded);
			}).pipe(fs.createWriteStream(calendarCachedFile));
		} else {
			//console.debug("File " + calendarCachedFile + " already exists, reading immediately from disk.");
			var stats = fs.statSync(calendarCachedFile);
			var modifiedTime = new Date(stats.mtime);
			// if cache data is older than timeout, get from URL, else read cache.
			var timeNow = new Date();
			var age = timeNow.getMilliseconds() - modifiedTime.getMilliseconds();
			
			if (age > maxCacheTime) {
				console.log("Data on disk is older than max age, retriving fresh from URL.");
				request(calendarUrl, function (error, calXhrResponse, body) {
					readFilesystemCalendar(onCalendarDataLoaded);
				}).pipe(fs.createWriteStream(calendarCachedFile));
			} else {
				readFilesystemCalendar(onCalendarDataLoaded);
			}
		}
	} else {
		console.log("Calendar data already loaded.");
		onCalendarDataLoaded();
	}
};

function parseStageInto(stage, ical, options) {
	var matches = stage.matches;
	for (var i = 0;i < matches.length;i++) {
		parseMatchesInto(stage.name, matches[i], ical, options);
	}
}

function getAbbreviatedName(competitor) {
	var abbr;
	if (competitor == null) {
		abbr = "TBA";
	} else if (competitor.abbreviatedName) {
		abbr = competitor.abbreviatedName;
	} else if (competitor.content.abbreviatedName) {
		abbr = competitor.content.abbreviatedName;
	}
	return abbr;
}

function getMatchSummaryString(options, stageName, match, compet1, compet2) {
	var score1 = "", score2 = "";
	var vs = options.format == FORMAT_DETAILED ? " vs " : " v ";
	if (options.showScores() && strcasecmp(match.state, "CONCLUDED")) {
		if (strcasecmp(match.winner.abbreviatedName, compet2.abbreviatedName)) {
			var compTmp = compet2;
			compet2 = compet1;
			compet1 = compTmp;
			score1 = " [" + match.scores[1].value + "]";
			score2 = " [" + match.scores[0].value + "]";
		} else {
			score1 = " [" + match.scores[0].value + "]";
			score2 = " [" + match.scores[1].value + "]";
		 }
		 vs = " d ";
	}

	var summary;
	if (options.format == FORMAT_DETAILED) {
		summary = stageName;
		if (match.tournament.type == 'PLAYOFFS') {
			summary += ' Playoffs';
		}
		var comp1 = compet1 == null ? "TBA" : compet1.name + score1;
		var comp2 = compet2 == null ? "TBA" : compet2.name + score2;
		summary += " - " + comp1 + vs + comp2;
	} else {
		var abbr1 = getAbbreviatedName(compet1);
		var abbr2 = getAbbreviatedName(compet2);
		summary = "OWL " + abbr1 + score1 + vs + abbr2 + score2;
	}
	console.log(summary);
	return summary;
}

function getMatchDescriptionString(stageName, match,compet1, compet2) {
	var description = stageName;
	if (match.tournament.type == 'PLAYOFFS') {
		description += ' Playoffs';
	}
	var comp1 = compet1 == null ? "TBA" : compet1.name;
	var comp2 = compet2 == null ? "TBA" : compet2.name;
	description += " - " + comp1 + " vs " + comp2;
	return description;
}

function shouldShowMatch(options, competitors) {
	var filteredTeams = options.teams;
	var showMatch = true;
	if (options.showAllTeams()) {
		// filter to only show matches for teams in array.
		showMatch = true;
	} else {
		var abbr1 = getAbbreviatedName(competitors[0]);
		var abbr2 = getAbbreviatedName(competitors[1]);
		if (filteredTeams.indexOf(abbr1) !== -1 || filteredTeams.indexOf(abbr2) !== -1) {
			showMatch = true;
		}
		else {
			showMatch = false;
		}
	}
	return showMatch;
}

function parseMatchesInto(stageName, match, ical, options) {
	var filteredTeams = options.teams;
	
	var competitors = match.competitors;
	if (competitors.length < 2 || !competitors) {
		console.log("Competitors in match was null: " + JSON.stringify(match));
	} else {
		var comp1 = competitors[0] == null ? "TBA" : competitors[0].name;
		var comp2 = competitors[1] == null ? "TBA" : competitors[1].name;
		var abbr1 = getAbbreviatedName(competitors[0]);
		var abbr2 = getAbbreviatedName(competitors[1]);
		
		var showMatch = shouldShowMatch(options, competitors);
		
		if (showMatch) {
			var summary = getMatchSummaryString(options, stageName, match, competitors[0], competitors[1]);
			var description = getMatchDescriptionString(stageName, match, competitors[0], competitors[1]);
			
			var event = ical.createEvent({
				id: match.id,
				summary: summary,
				description: description,
				start: match.startDate,
				end: match.endDate,
				sequence: match.id,
				location: match.tournament.location
			});
		}
	}
}

exports.getCalendar = function(calData, response, teams) {
	var stages = calData.data.stages;
	
	for (var i = 0;i < stages.length;i++) {
		parseStageInto(stages[i], ical, teams);
	}

	ical.serve(response);
};

function buildCalendar(options) {
	var ical = icalgen().ttl(60*60*24);
	ical.domain("owlcalendar");

	var stages = calendarData.data.stages;
	for (var i = 0;i < stages.length;i++) {
		parseStageInto(stages[i], ical, options);
	}
	return ical;
}

var params=function (req) {
  let q=req.url.split('?'),result={};
  if(q.length>=2){
      q[1].split('&').forEach((item)=>{
           try {
             result[item.split('=')[0]]=item.split('=')[1];
           } catch (e) {
             result[item.split('=')[0]]='';
           }
      })
  }
  return result;
}

exports.serveIndex = function(clientIp, request, response) {
	fs.readFile('./index.html', function(err, data) {
		response.end(data);
	});
	console.log(clientIp +  " Serving index for " + request.url);
}; 

function getFilteredTeams(pars) {
	var teams = null;
	if (pars.teams) {
		teams = pars.teams.split(',');
	}
	return teams;
}

function strcasecmp(string1, string2) {
	if (string1 == null && string2 == null) {
		return true;
	}
	if (string1 == null || string2 == null) {
		return false;
	}
	string1 = string1.toLowerCase();
	string2 = string2.toLowerCase();
	
	return string1 === string2;
}

function ensureDataLoaded(callback) {
	exports.getCachedData(callback);
}

function getOptions(request) {
	var pars = params(request);
	var teams = getFilteredTeams(pars);

	var options = {
		format: pars.format != null && strcasecmp(pars.format, PARAM_FORMAT_DETAILED) ? FORMAT_REGULAR: FORMAT_DETAILED,
		scores: pars.scores != null && (strcasecmp(pars.scores, PARAM_SCORES_SHOW) || strcasecmp(pars.scores, "true")) ? SHOW_SCORES : 0,
		teams: teams,
		
		showAllTeams: function() {
			if (this.teams == null || this.teams.length <= 0) {
				return true;
			}
			return true;
		},
		showScores: function() {
			return this.scores == SHOW_SCORES;
		}
	}
	return options;
}

exports.serveOwlIcal = function(request, response) {
	var ipInfo = getIP(request);
	var clientIp = ipInfo.clientIp;
	var requestTime = new Date();
	var options = getOptions(request);

	if (options.showAllTeams()) {
		console.log(requestTime.toString() + " " + clientIp + " Returning all teams.");
	} else {
		console.log(requestTime.toString() + " " + clientIp + " Returning only teams " + options.teams);
	}

	ensureDataLoaded(function() {
		var ical = buildCalendar(options);
		ical.serve(response);
	});
};

ensureDataLoaded(function() {});
console.log("OWLCalendar module loaded.");
