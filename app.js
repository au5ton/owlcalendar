const owl = require('./owlcalendar');

const http = require('http');
const handler = require('serve-handler');
var getIP = require('ipware')().get_ip;

//const hostname = '127.0.0.1';
const hostname = '0.0.0.0';
const port = 3000;

function serveCalendar(request, response) {
	owl.serveOwlIcal(request, response);
}

function onRequest(request, response) {
	if (request.url.startsWith('/calendar')) {
		try {
			serveCalendar(request, response);
		} catch (exception) {
			console.log("Exception while serving calendar: " + exception);
		}
	} else {
		try {
			var ipInfo = getIP(request);
			var clientIp = ipInfo.clientIp;
	
			owl.serveIndex(clientIp, request, response);
		} catch (exception) {
			console.log("Exception while serving index: " + exception);
		}
	}
}

const server = http.createServer(onRequest);

owl.getCachedData(function() {
	server.listen(port, hostname, () => {
		console.log(`Server running at http://${hostname}:${port}/`);
	});
});

