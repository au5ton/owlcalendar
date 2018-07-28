'use strict';

var fs = require('fs');
var icalgen = require('ical-generator');
var request = require('request');
var getIP = require('ipware')().get_ip;
var url = require('url');
var md5 = require('md5');

const cacheHours = 12;
const maxCacheTime = cacheHours * 60 * 60 * 1000;
//const calendarCachedFile = 'calendar.json';
//const calendarUrl = 'https://api.overwatchleague.com/schedule?expand=team.content&locale=en_US';
const calendarDomain = 'owl.tjsr.id.au';
const calendarName = 'Overwatch League ICS Calendar.';
const configFile = "config.json";

const FORMAT_REGULAR = "1";
const FORMAT_DETAILED = "2";
const SHOW_SCORES = "4";
const PARAM_SCORES_SHOW = 'SHOW';
const PARAM_FORMAT_DETAILED = 'DETAILED';
const ALLOWED_RESOURCES = [ '/favicon.ico', '/index.html' ];

var loadedData = [];
var cacheImmediatelyAfter = -1;

var config;
var exports = module.exports = {};

function findLoadedDataIndex(name) {
	for (var i = 0;i < loadedData.length;i++) {
		var node = loadedData[i];
		if (!node.config.name) {
			console.trace("loadedData array node existed with no name property.");
		} else if (strcasecmp(node.config.name, name)) {
			return i;
		}
	}
	return -1;
}

function findLoadedData(name) {
	var index = findLoadedDataIndex(name);
	if (index >= 0) {
		return loadedData[index];
	} else {
		return;
	}
}

function isFileLoaded(configNode) {
	return findLoadedData(configNode.name) != undefined;
}

function addLoadedData(calendarDataObj, timeLoaded, configItem) {
	var noRefresh = false;
	if (configItem.final) {
		noRefresh = true;
	}
	var nextCacheTime = getNextCacheTime(configItem.cache, calendarDataObj);
	if (!nextCacheTime) {
		console.debug("Could not determine a next time to refresh cache for " + configItem.name);
	}
	var data = {
		calendar: calendarDataObj,
		timeLoaded: timeLoaded,
		config: configItem,
		nextCacheTime: nextCacheTime,
		noRefresh: noRefresh
	};
	
	var index = findLoadedDataIndex(configItem.name);
	if (index >= 0) {
		loadedData[index] = data;// overwrite
	} else {
		loadedData.push(data);
	}
	return data;
}

async function readConfig(fileToRead, onConfigRead, onComplete) {
	if (!fileToRead) {
		fileToRead = configFile;
	}
	fs.readFile(fileToRead, 'utf8', function (err, data) {
		config = JSON.parse(data);
		console.log("Config loaded from " + fileToRead);
		onConfigRead(onComplete);
		return config;
	});
}

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

async function readFromUrlAndWriteToCache(configNode) {
	var urlToRetrieve = configNode.url;
	var writeTo = configNode.cache;
	
	console.log("Reading remote calendar file from " + urlToRetrieve);
	request(urlToRetrieve, function (error, calXhrResponse, body) {
		if (body) {
			var calDataObj = JSON.parse(body);
			var timeNow = new Date();
			var dataNode = addLoadedData(calDataObj, timeNow, configNode);
			console.log("Loaded file from " + urlToRetrieve + ". Next refresh is due at " + dataNode.nextCacheTime);
			return calDataObj;
		} else {
			console.trace("Failed reading calendar data from " + urlToRetrieve + " Method: " + onCalendarDataLoaded + " WriteTo: " + writeTo);
			return;
		}
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

function getNextMatchCompletion(calendarData) {
	var nonConcludedMatches = [];
	if (!calendarData) {
		throw Error('Null param passed in to getNextMatchCompletion');
	} else if (calendarData.data && calendarData.data.stages) {
		var stages = calendarData.data.stages;
		
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
	} else if (calendarData.brackets) {
		console.log("Parsing as World Cup round-robin data.");
		var brackets = calendarData.brackets;
		
		for (var i = 0;i < brackets.length;i++) {
			var bracket = brackets[i];
			var matches = bracket.matches;
			for (var j = 0;j < matches.length;j++) {
				var match = matches[j];
				if (!strcasecmp("CONCLUDED", match.state)) {
					nonConcludedMatches.push(match);
				}
			}
		}
	} else if (!calendarData.data && !calendarData.brackets) {
		console.trace("Loaded data array does not contain calendar but was " + calendarData);
	}
}

function getNextCacheTimeFromConfNode(confNode) {
	var cacheFile = confNode.cache;
	var data = findLoadedData(confNode.name);
	if (!data) {
		throw Error("Did not find loaded data for name " + confNode.name)
	} else {
		data.nextCacheTime = getNextCacheTime(cacheFile, data.calendar);
	}
}

function getNextCacheTime(targetFile, calendarData) {
	var fileExpiryLocal = getFileExpiry(targetFile);
	var fileExpiryUTCEpoch = fileExpiryLocal.getTime(); 
	var nextMatchCompetionUTCEpoch = getNextMatchCompletion(calendarData);
	var utcMatchTime = new Date(0);
	utcMatchTime.setTime(nextMatchCompetionUTCEpoch);
	if (fileExpiryUTCEpoch < nextMatchCompetionUTCEpoch || nextMatchCompetionUTCEpoch <= 0) {
		console.log("File exipres first - cache file " + targetFile + " expires at " + fileExpiryLocal);
		return fileExpiryLocal;
	} else if (nextMatchCompetionUTCEpoch > 0) {
		console.log("Next match is scheduled to end before cache expiry at " + utcMatchTime);
		return utcMatchTime;
	} else {
		console.log("There was a problem getting cache expiry for " + targetFile + " with file expiry of " + fileExpiryLocal + " and match completion of " + utcMatchTime);
		return fileExpiryLocal;
	}
}

async function readFilesystemCalendar(configNode) {
	var sourceUrl = configNode.url;
	var targetOnFilesystem = configNode.cache;
	
	fs.readFile(targetOnFilesystem, 'utf8', function (err, data) {
		if (err) {
			return console.log("Error retrieving " + targetOnFilesystem + ": " + err);
		} else {
			if (strcasecmp(data, "") || !data) {
				console.log("Data on disk was invalid, retrieving from " + sourceUrl);
				readFromUrlAndWriteToCache(configNode);
			} else {
				var calData = JSON.parse(data);
				var timeNow = new Date().getTime();
				var nodeItem = addLoadedData(calData, timeNow, configNode);
				if (configNode.final) {
					console.log("Calendar exists on filesystem at " + targetOnFilesystem + " and is set to final, no refresh to be requested.")
				} else if (nodeItem.nextCacheTime && timeNow > nodeItem.nextCacheTime) {
					console.log("Calendar data on filesystem at " + targetOnFilesystem + " requires refresh.");
					readFromUrlAndWriteToCache(configNode);
				}
				else {
					console.log("Calendar data retrieved from filesystem at " + targetOnFilesystem);
				}
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

function cachedFileExpired(configItem) {
	var cachedFile = configItem.cache;
	if (fs.existsSync(cachedFile) && configItem.final) {
		return false;
	}
	var dataItem = findLoadedData(configItem.name);
	var timeNow = new Date();
	if (dataItem.nextCacheTime && dataItem.nextCacheTime > 0 && timeNow.getTime() > dataItem.nextCacheTime) {
		var cachedRequestedAt = new Date(0);
		cachedRequestedAt.setTime(dataItem.nextCacheTime);
		console.log("Cache after time on " + cachedFile + " was set to require update at " + cachedRequestedAt);
		return true;
	}
	
	var stats = fs.statSync(cachedFile);
	var modifiedTime = new Date(stats.mtime);
	// if cache data is older than timeout, get from URL, else read cache.
	var age = timeNow.getTime() - modifiedTime.getTime();
	console.log("Cache file " + cachedFile + " was last updated at " + modifiedTime);
	
	var cacheExpired = age > maxCacheTime;
	return cacheExpired;
}

exports.checkDataCachedForConfig = async function(configNode) {
	var data = findLoadedData(configNode.name);
	var urlToRetrieve = configNode.url;
	var fileOnDisk = configNode.cache;
	
	if (fs.existsSync(fileOnDisk)) {
		if (isFileLoaded(configNode) && cachedFileExpired(configNode)) {
			console.log("Cache file " + fileOnDisk + " has expired.");
			await readFromUrlAndWriteToCache(configNode);
			return;
		} else {
			console.log("Reading from filesystem: " + fileOnDisk);
			await readFilesystemCalendar(configNode);
			return;
		}
	} else {
		await readFromUrlAndWriteToCache(configNode);
		return;
	}
	console.debug("No path followed, calling not-cached method " + onDataNotCached + " with params " + urlToRetrieve + ", " + fileOnDisk);
	await readFromUrlAndWriteToCache(configNode);
};

exports.getCachedData = async function() {
	for (var nodeNumber = 0;nodeNumber < config.calendars.length;nodeNumber++) {
		await exports.checkDataCachedForConfig(config.calendars[nodeNumber]);
	}
	return;
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
		if (earliest < 0 || matches[i].endDateTS < earliest && matches[i].endDateTS < earliest > 0) {
			earliest = matches[i].endDateTS;
		}
	}
	return earliest;
}

function parseContainerMatchesInto(matches, ical, options, stageName) {
	var dueForCompletionMatches = [];
	for (var i = 0;i < matches.length;i++) {
		var currentMatch = matches[i];
		var showMatch = shouldShowMatch(options, currentMatch);
		if (showMatch) {
			if (currentMatch.startDate) {
				parseMatchesInto(stageName, currentMatch, ical, options);
				if (dueForFinish(currentMatch)) {
					dueForCompletionMatches.push(currentMatch);
				}
			}
		}
	}
	if (dueForCompletionMatches.length > 0) {
		var earliestMatchTime = getEarliestMatchTime(dueForCompletionMatches);
		cacheImmediatelyAfter = earliestMatchTime;
	}
}

function parseBracketInto(bracket, ical, options) {
	var matches = bracket.matches;
	parseContainerMatchesInto(matches, ical, options, bracket.name);
}

function parseStageInto(stage, ical, options) {
	var matches = stage.matches;
	parseContainerMatchesInto(matches, ical, options, stage.name);
}

function getAbbreviatedName(competitor) {
	var abbr;
	if (competitor == null) {
		abbr = "TBA";
	} else if (competitor.abbreviatedName) {
		abbr = competitor.abbreviatedName;
	} else if (competitor.content && competitor.content.abbreviatedName) {
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
		if (match.tournament && match.tournament.type == 'PLAYOFFS') {
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

function getScoreLine(match, scoreIndex) {
	if (match.scores.length == 0) {
		return "";
	}
	var games = match.games;
	var scoreLine = "";
	for (var i = 0;i < games.length;i++) {
		var game = games[i];
		if (game.points && game.points.length > scoreIndex-1) {
			try {
				scoreLine += game.points[scoreIndex] + " ";
			} catch (exception) {
				console.debug("In match " + match.competitors[0].name + " v " + match.competitors[1].name + " on " + match.startDate);
			}
		}
	}
	scoreLine += "[" + match.scores[scoreIndex].value + "]";
	return scoreLine;
}

function getMatchDescriptionString(options, stageName, match, compet1, compet2) {
	var description = stageName;
	if (match.tournamen && match.tournament.type == 'PLAYOFFS') {
		description += ' Playoffs';
	}
	var comp1 = compet1 == null ? "TBA" : compet1.name;
	var comp2 = compet2 == null ? "TBA" : compet2.name;
	description += " - " + comp1 + " vs " + comp2;
	
	if (options.showScores() && strcasecmp("CONCLUDED", match.status)) {
		var scoreLine1 = getScoreLine(match, 0);
		var scoreLine2 = getScoreLine(match, 1);
		description += "\n";
		description += compet1.name + ": " + scoreLine1 + "\n";
		description += compet2.name + ": " + scoreLine2 + "\n";
	}
	return description;
}

function hasConfTourneyId(region, tourneyId) {
	var returnVal = false;
	config.calendars.forEach((confCalendar)=>{
		if (confCalendar.regions) {
			confCalendar.regions.forEach((confCalRegion)=>{
				var confCalRegionRegion = confCalRegion.region;
				var confCalRegionAbbr = confCalRegion.abbreviation;
				var confCalRegionTourneyId = confCalRegion.tournamentId;
				
				if (strcasecmp(region, confCalRegionRegion) || strcasecmp(region, confCalRegionAbbr))
				{
					if (tourneyId === confCalRegionTourneyId) {
						returnVal = true;
					}
				}
			});
		}
	});
	return returnVal;
}

function includeMatchRegion(options, match) {
	var includeThisMatch = false;
	if (options.showAllRegions()) {
		includeThisMatch = true;
	} else {
		var matchTournamentId = match.tournament.id;
		options.regions.forEach((optRegion)=>{
			var regionName = optRegion;
			var confRegionHasTourneyId = hasConfTourneyId(regionName, matchTournamentId);
			if (confRegionHasTourneyId) {
				includeThisMatch = true;
			}
		});
	}
	return includeThisMatch;
}

function shouldShowMatch(options, match) {
	if (!match.startDate) {
		return false;
	}
	var competitors = match.competitors;
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
	
	if (!options.showAllRegions() && showMatch) {
		var includeRegion = includeMatchRegion(options, match);
		showMatch = includeRegion;
	}
	return showMatch;
}

function generateMatchSequence(match, stageName, options) {
	var competitors = match.competitors;
	var strForHash = match.startDate.day + ":" + getMatchSummaryString(options, stageName, match, competitors[0], competitors[1]);
	var digest = md5(strForHash);
	var digestHex = digest.substring(0, 4);
	var digestInt = parseInt("0x" + digestHex);
	return digestInt;
}

function parseMatchesInto(stageName, match, ical, options) {
	if (!match.startDate) {
		throw Error("Match does not have a start date, to can't be created as a calendar event.");
	}
	var filteredTeams = options.teams;
	
	var competitors = match.competitors;
	if (competitors.length < 2 || !competitors) {
		console.log("Competitors in match was null: " + JSON.stringify(match));
	} else {
		var comp1 = competitors[0] == null ? "TBA" : competitors[0].name;
		var comp2 = competitors[1] == null ? "TBA" : competitors[1].name;
		//var abbr1 = getAbbreviatedName(competitors[0]);
		//var abbr2 = getAbbreviatedName(competitors[1]);
		
		var summary = getMatchSummaryString(options, stageName, match, competitors[0], competitors[1]);
		var description = getMatchDescriptionString(options, stageName, match, competitors[0], competitors[1]);
		var eventLocation = 'Unknown';
		if (match.tournament && match.tournament.location) {
			eventLocation = match.tournament.location;
		}
		
		var startDate;

		if (match.startDate.timestamp) {
			var tmpDate = new Date(match.startDate.timestamp);
			startDate = tmpDate.toISOString();
		} else {
			startDate = match.startDate;
		}

		var seq;
		if (match.id) {
			seq = match.id;
		} else {
			seq = generateMatchSequence(match, stageName, options);
		}
		
		var event = ical.createEvent({
			id: seq,
			summary: summary,
			description: description,
			start: startDate,
			end: match.endDate,
			sequence: seq,
			location: eventLocation
		});
	}
}

exports.getCalendar = function(calendars, response, teams) {
	for (var calNumber = 0;calNumber < calendars.length;calNumber++) {
		var calData = calendars[calNumber];
		var stages = calData.data.stages;
		
		for (var i = 0;i < stages.length;i++) {
			parseStageInto(stages[i], ical, teams);
		}
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

function includeLeague(options, loadedItem) {
	var league = loadedItem.config.tag;
	var filteredLeagues = options.leagues;
	if (options.showDefaultLeagues()) {
		console.log("league=" + loadedItem.config.default + " for " + loadedItem.config.name + " because no leagues param provided.");
		return loadedItem.config.default;
	} else if (filteredLeagues.indexOf(league) !== -1) {
		return true;
	}
	return false;
}

function buildCalendar(options) {
	var ttl = getTtl();
	var ical = icalgen().ttl(ttl);
	ical.domain(calendarDomain);
	ical.name(calendarName);
	
	console.log(loadedData.length + " calendars loaded.");

	for (var cal = 0;cal < loadedData.length;cal++) {
		var loadedItem = loadedData[cal];
		if (includeLeague(options, loadedItem)) {
			console.log("Adding data from calendar " + loadedItem.config.name);
			var currentCal = loadedItem.calendar;
			
			if (currentCal.data && currentCal.data.stages) {
				var stages = currentCal.data.stages;
				for (var i = 0;i < stages.length;i++) {
					parseStageInto(stages[i], ical, options);
				}
			} else if (currentCal.brackets) {
				var brackets = currentCal.brackets;
				for (var i = 0;i < brackets.length;i++) {
					parseBracketInto(brackets[i], ical, options);
				}
			}
		}
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

function allowedResource(url) {
	for (var i = 0;i < ALLOWED_RESOURCES.length;i++) {
		if (strcasecmp(ALLOWED_RESOURCES[i], url)) {
			return true;
		}
	}
	return false;
}

function logRequest(clientIp, url, responseCode) {
	console.log(clientIp + " " + url + " " + responseCode);
}

exports.serveRequest = function (clientIp, request, response) {
	var path = url.parse(request.url).pathname;
	if (request.url.startsWith('/calendar')) {
		try {
			exports.serveOwlIcal(request, response);
		} catch (exception) {
			console.log("Exception while serving calendar: " + exception.stack);
			response.end();
		}
	} else if (allowedResource(request.url) && fs.existsSync('.' + request.url)) {
		fs.readFile('.' + request.url, function(err, data) {
			response.end(data);
		});
		logRequest(clientIp, request.url, 200);
	} else if (!strcasecmp(path, "/")) {
		if (!response) {
			console.log("No response object.");
		} else {
			response.writeHead(404, 'Not found');
			response.end('Not found');
			logRequest(clientIp, request.url, 404);
		}
	} else {
		fs.readFile('./index.html', function(err, data) {
			response.writeHead(200, 'OK');
			response.end(data);
		});
		logRequest(clientIp, request.url, 200);
	}
}; 

function getFilteredTeams(pars) {
	var teams = null;
	if (pars.teams) {
		teams = pars.teams.split(',');
	}
	return teams;
}

function getFilteredLeagues(pars) {
	var leagues = null;
	if (pars.leagues) {
		leagues = pars.leagues.split(',');
	}
	return leagues;
}

function getFilteredRegions(pars) {
	var regions = null;
	if (pars.regions) {
		regions = pars.regions.split(',');
	}
	return regions;
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

async function ensureDataLoaded() {
	await exports.getCachedData();
}

function createOptionsFromPars(pars) {
	var teams = getFilteredTeams(pars);
	var leagues = getFilteredLeagues(pars);
	var regions = getFilteredRegions(pars);
	
	var options = {
		format: pars.format == null || (pars.format != null && strcasecmp(pars.format, PARAM_FORMAT_DETAILED) ? FORMAT_DETAILED : FORMAT_REGULAR),
		scores: pars.scores != null && (strcasecmp(pars.scores, PARAM_SCORES_SHOW) || strcasecmp(pars.scores, "true")) ? SHOW_SCORES : 0,
		teams: teams,
		leagues: leagues,
		regions: regions,
		
		showDetailedSummary: function() {
			return this.format == FORMAT_DETAILED;
		},
		showAllTeams: function() {
			if (this.teams == null || this.teams.length <= 0) {
				return true;
			}
			return false;
		},
		showDefaultLeagues: function() {
			if (this.leagues == null || this.leagues.length <= 0) {
				return true;
			}
			return false;
		},
		showAllRegions: function() {
			if (this.regions == null || this.regions.length <= 0) {
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

exports.serveOwlIcal = async function(request, response) {
	var ipInfo = getIP(request);
	var clientIp = ipInfo.clientIp;
	var requestTime = new Date();
	var options = getOptions(request);

	if (options.showAllTeams()) {
		console.log(requestTime.toString() + " " + clientIp +  " " + request.url + " Returning all teams.");
	} else {
		console.log(requestTime.toString() + " " + clientIp +  " " + request.url + " Returning only teams " + options.teams);
	}

	await ensureDataLoaded();
	
	var ical = buildCalendar(options);
	ical.serve(response);
};


exports.init = async function(onComplete, configToRead) {
	try {
		await readConfig(configToRead, exports.getCachedData, onComplete);
	} catch (e) {
		console.log("Exception while reading config " + configToRead);
		console.log(e);
	}
	onComplete();
};

//ensureDataLoaded(function() {});
//console.log("OWLCalendar module loaded.");
