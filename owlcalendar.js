'use strict';

var fs = require('fs');
var icalgen = require('ical-generator');
var calendarData;
var ical = icalgen().ttl(60*60*24);
var request = require('request');

var calendarCachedFile = 'calendar.json';
const calendarUrl = 'https://api.overwatchleague.com/schedule?expand=team.content&locale=en_US';

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

function readFilesystemCalendar(onDataRetrieved, response, teams) {
	fs.readFile(calendarCachedFile, 'utf8', function (err, data) {
		if (err) {
			return console.log("Error retrieving calendar.json: " + err);
		} else {
			console.log("Calendar data retrieved.");
			calendarData = JSON.parse(data);
			//console.debug("Calling function " + onDataRetrieved); 
			onDataRetrieved(calendarData, response, teams);
		}
	});
}

exports.getCachedData = function(onDataRetrieved, response, teams) {
	if (calendarData == null) {
		console.log("Loading calendar data.");
		if (!fs.existsSync(calendarCachedFile)) {
			console.log("Reading remote calendar file from " + calendarUrl);
			request(calendarUrl, function (error, calXhrResponse, body) {
				readFilesystemCalendar(onDataRetrieved, response, teams);
			}).pipe(fs.createWriteStream(calendarCachedFile));
		} else {
			//console.debug("File " + calendarCachedFile + " already exists, reading immediately from disk.");
			readFilesystemCalendar(onDataRetrieved, response, teams);
		}
	} else {
		console.log("Calendar data already loaded.");
		onDataRetrieved(calendarData, response);
	}
};

function parseStageInto(stage, ical, filteredTeams) {
	var matches = stage.matches;
	for (var i = 0;i < matches.length;i++) {
		parseMatchesInto(stage.name, matches[i], ical, filteredTeams);
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

function parseMatchesInto(stageName, match, ical, filteredTeams) {
	var competitors = match.competitors;
	if (competitors.length < 2 || !competitors) {
		console.log("Competitors in match was null: " + JSON.stringify(match));
//	} else if (!competitors[0] == null || competitors[1] == null) {
//		console.log("Competitors in match was null: " + JSON.stringify(match));
//	} else if (!competitors[0].name || !competitors[1].name) {
//		console.log("Competitor in match had no name: " + JSON.stringify(match));
	} else {
		var comp1 = competitors[0] == null ? "TBA" : competitors[0].name;
		var comp2 = competitors[1] == null ? "TBA" : competitors[1].name;
		var abbr1 = getAbbreviatedName(competitors[0]);
		var abbr2 = getAbbreviatedName(competitors[1]);
		
		var showMatch = true;
		if (filteredTeams == null || filteredTeams.length == 0) {
			// filter to only show matches for teams in array.
			showMatch = true;
		} else {
			if (filteredTeams.indexOf(abbr1) !== -1 || filteredTeams.indexOf(abbr2) !== -1) {
				showMatch = true;
			}
			else {
				showMatch = false;
			}
		}
		
		if (showMatch) {
			var description = stageName;
			var summary = "OWL ";
			if (match.tournament.type == 'PLAYOFFS') {
				description += ' Playoffs';
			}
			description += " - " + comp1 + " vs " + comp2;
			summary += abbr1 + " v " + abbr2;
			var event = ical.createEvent({
				summary: summary,
				description: description,
				start: match.startDate,
				end: match.endDate,
				sequence: match.id,
				location: match.tournament.location
			});
	
			//console.debug("Match " + match.id + " at " + match.startDate + ": " + summary);
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

exports.getFilteredTeams = function(request) {
	var pars = params(request);
	var teams = null;
	if (pars.teams) {
		teams = pars.teams.split(',');
	}
	return teams;
}

exports.getOwlIcal = function(response, teams) {
	exports.getCachedData(exports.getCalendar, response, teams);
};

