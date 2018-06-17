'use strict';

var fs = require('fs');
var icalgen = require('ical-generator');
var request = require('request');
var getIP = require('ipware')().get_ip;
var url = require('url');

const cacheHours = 12;
const maxCacheTime = cacheHours * 60 * 60 * 1000;
const calendarCachedFile = 'calendar.json';
const calendarUrl = 'https://api.overwatchleague.com/schedule?expand=team.content&locale=en_US';
const calendarDomain = 'owl.tjsr.id.au';

const FORMAT_REGULAR = "1";
const FORMAT_DETAILED = "2";
const SHOW_SCORES = "4";
const PARAM_SCORES_SHOW = 'SHOW';
const PARAM_FORMAT_DETAILED = 'DETAILED';

var calendarData;
var cacheImmediatelyAfter = -1;

var exports = module.exports = {};

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

function readFromUrlAndWriteToCache(onCalendarDataLoaded, urlToRead, writeTo) {
	console.log("Reading remote calendar file from " + urlToRead);
	request(urlToRead, function (error, calXhrResponse, body) {
		calendarData = JSON.parse(body);
		onCalendarDataLoaded(calendarData);
	}).pipe(fs.createWriteStream(writeTo));
}

function getFileExpiry(cachedFile) {
	var stats = fs.statSync(cachedFile);
	var modifiedTime = new Date(stats.mtime);
	var expiryTime = maxCacheTime + modifiedTime.getTime();
	var expiryDate = new Date(0);
	expiryDate.setMilliseconds(expiryTime);
	return expiryDate;
}

function getNextMatchCompletion(calData) {
	var nonConcludedMatches = [];
	var stages = calData.data.stages;
	
	for (var i = 0;i < stages.length;i++) {
		var stage = stages[i];
		var matches = stage.matches;
		for (var j = 0;j < matches.length;j++) {
			var match = matches[j];
			if (!strcasecmp("CONCLUDED", match.state)) {
				nonConcludedMatches.push(match);
			}
		}
	}

	var earliestMatch = getEarliestMatchTime(nonConcludedMatches);
	return earliestMatch;
}

function getNextCacheTime(targetFile, data) {
	var fileExpiryLocal = getFileExpiry(targetFile);
	var fileExpiryUTCEpoch = fileExpiryLocal.getTime(); 
	var nextMatchCompetionUTCEpoch = getNextMatchCompletion(data);
	if (fileExpiryUTCEpoch < nextMatchCompetionUTCEpoch) {
		console.log("Cache file " + targetFile + " expires at " + fileExpiry);
		return fileExpiry;
	} else {
		var utcMatchTime = new Date(0);
		utcMatchTime.setTime(nextMatchCompetionUTCEpoch);
		console.log("Next match is scheduled to end before cache expiry at " + utcMatchTime);
		return utcMatchTime;
	}
}

function readFilesystemCalendar(onCalendarDataLoaded, onCacheDataInvalid, sourceUrl, targetOnFilesystem) {
	fs.readFile(targetOnFilesystem, 'utf8', function (err, data) {
		if (err) {
			return console.log("Error retrieving " + targetOnFilesystem + ": " + err);
		} else {
			if (strcasecmp(data, "") || !data) {
				console.log("Data on disk was invalid, retrieving from " + sourceUrl);
				onCacheDataInvalid(onCalendarDataLoaded, sourceUrl, targetOnFilesystem);
			} else {
				console.log("Calendar data retrieved from " + targetOnFilesystem);
				calendarData = JSON.parse(data);
				//console.debug("Calling function " + onCalendarDataLoaded);
				cacheImmediatelyAfter = getNextCacheTime(targetOnFilesystem, calendarData);
				onCalendarDataLoaded(calendarData);
			}
		}
	});
}

function isCurrentTimeAfterUTCTime(timestamp) {
	var timeNow = new Date();
	var timeNowUTC = new Date(timeNow.toUTCString());
	var epochNow = timeNowUTC.getTime();

	return timestamp > 0 && epochNow > timestamp;
}

exports.getDataFromFilesystem = function(onDataReadComplete) {
};

function cachedFileExpired(cachedFile) {
	var timeNow = new Date();
	if (timeNow.getTime() > cacheImmediatelyAfter && cacheImmediatelyAfter > 0) {
		var cachedRequestedAt = new Date(0);
		cachedRequestedAt.setTime(cacheImmediatelyAfter);
		console.log("Cache after time was set to require update at " + cachedRequestedAt);
		return true;
	}
	
	var stats = fs.statSync(cachedFile);
	var modifiedTime = new Date(stats.mtime);
	// if cache data is older than timeout, get from URL, else read cache.
	var age = timeNow.getTime() - modifiedTime.getTime();
	console.log("Cache file was last updated at " + modifiedTime);
	
	var cacheExpired = age > maxCacheTime;
	return cacheExpired;
}

exports.checkDataCached = function(onDataCached, onDataNotCached, urlToRetrieve, fileOnDisk) {
	if (calendarData == null) {
		if (fs.existsSync(fileOnDisk)) {
			if (cachedFileExpired(fileOnDisk)) {
				console.debug("Calling not-cached method " + onDataNotCached + " with params " + urlToRetrieve + ", " + fileOnDisk);
				onDataNotCached(onDataCached, urlToRetrieve, fileOnDisk);
				return;
			} else {
				// Get next cache update time
				var checkNextCacheTimeThenProceed = function() {
					var nextCacheDate = getNextCacheTime(fileOnDisk, calendarData);
					cacheImmediatelyAfter = nextCacheDate.getTime();
					onDataCached();
				}
				readFilesystemCalendar(checkNextCacheTimeThenProceed, onDataNotCached, urlToRetrieve, fileOnDisk);
				return;
			}
		} else {
			onDataNotCached(onDataCached, urlToRetrieve, fileOnDisk);
			return;
		}
	}
	else {
		onDataCached();
		return;
	}
	console.debug("No path followed, calling not-cached method " + onDataNotCached + " with params " + urlToRetrieve + ", " + fileOnDisk);
	onDataNotCached(onDataCached, urlToRetrieve, fileOnDisk);
};

exports.getCachedData = function(onCalendarDataLoaded) {
	exports.checkDataCached(onCalendarDataLoaded, readFromUrlAndWriteToCache, calendarUrl, calendarCachedFile);
};

function dueForFinish(match) {
	var timeNow = new Date();
	var timeNowUTC = new Date(timeNow.toUTCString());
	var epochNow = timeNowUTC.getTime();
	if (strcasecmp(match.state, "PENDING") && epochNow > parseInt(match.endDateTS)) {
		return true;
	}
	return false;
}

function getEarliestMatchTime(matches) {
	var earliest = -1;
	for (var i = 0;i < matches.length;i++) {
		if (earliest < 0 || matches[i].endDateTS < earliest) {
			earliest = matches[i].endDateTS;
		}
	}
	return earliest;
}

function parseStageInto(stage, ical, options) {
	var matches = stage.matches;
	var dueForCompletionMatches = [];
	for (var i = 0;i < matches.length;i++) {
		var currentMatch = matches[i];
		parseMatchesInto(stage.name, currentMatch, ical, options);
		if (dueForFinish(currentMatch)) {
			matches.push(currentMatch);
		}
	}
	if (dueForCompletionMatches.length > 0) {
		var earliestMatchTime = getEarliestMatchTime(dueForCompletionMatches);
		cacheImmediatelyAfter = earliestMatchTime;
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
	var vs = options.showDetailedSummary() ? " vs " : " v ";
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
	if (options.showDetailedSummary()) {
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
	//console.log(summary);
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

function getTtl() {
	var currentTime = new Date().getTime();
	if (cacheImmediatelyAfter <= 0) {
		return cacheHours * 60 * 60;
	} else {
		var nextUpdateIn = Math.round((cacheImmediatelyAfter - currentTime) / 1000);
		return nextUpdateIn;
	}
}

function buildCalendar(options) {
	var ttl = getTtl();
	var ical = icalgen().ttl(ttl);
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
	var requestTime = new Date();
	var path = url.parse(request.url).pathname;
	if (!strcasecmp(path, "/")) {
		if (!response) {
			console.log("No response object.");
		} else {
			response.writeHead(404, 'Not found');
			response.end('Not found');
			console.log(requestTime.toString() + " " + clientIp +  " " + request.url + " 404");
		}
	} else {
		fs.readFile('./index.html', function(err, data) {
			response.end(data);
		});
		console.log(requestTime.toString() + " " + clientIp +  " " + request.url + " Serving index page.");
	}
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

function createOptionsFromPars(pars) {
	var teams = getFilteredTeams(pars);
	var options = {
		format: pars.format == null || (pars.format != null && strcasecmp(pars.format, PARAM_FORMAT_DETAILED) ? FORMAT_DETAILED : FORMAT_REGULAR),
		scores: pars.scores != null && (strcasecmp(pars.scores, PARAM_SCORES_SHOW) || strcasecmp(pars.scores, "true")) ? SHOW_SCORES : 0,
		teams: teams,
		
		showDetailedSummary: function() {
			return this.format == FORMAT_DETAILED;
		},
		showAllTeams: function() {
			if (this.teams == null || this.teams.length <= 0) {
				return true;
			}
			return false;
		},
		showScores: function() {
			return this.scores == SHOW_SCORES;
		}
	};
	return options;
}

function getOptions(request) {
	var pars = params(request);
	var options = createOptionsFromPars(pars);

	return options;
}

exports.serveOwlIcal = function(request, response) {
	var ipInfo = getIP(request);
	var clientIp = ipInfo.clientIp;
	var requestTime = new Date();
	var options = getOptions(request);

	if (options.showAllTeams()) {
		console.log(requestTime.toString() + " " + clientIp +  " " + request.url + " Returning all teams.");
	} else {
		console.log(requestTime.toString() + " " + clientIp +  " " + request.url + " Returning only teams " + options.teams);
	}

	ensureDataLoaded(function() {
		var ical = buildCalendar(options);
		ical.serve(response);
	});
};

exports.init = function(onComplete) {
	exports.getCachedData(onComplete);
};

//ensureDataLoaded(function() {});
console.log("OWLCalendar module loaded.");
