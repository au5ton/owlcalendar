const owl = require('./owlcalendar');

const http = require('http');
const handler = require('serve-handler');
var getIP = require('ipware')().get_ip;

//const hostname = '127.0.0.1';
const hostname = '0.0.0.0';
const port = 3000;

function onRequest(request, response) {
	var ipInfo = getIP(request);
	var clientIp = ipInfo.clientIp;
	
	var teams = owl.getFilteredTeams(request);
	if (teams) {
		console.log(clientIp + " Returning only teams " + teams);
	} else {
		console.log(clientIp + " Returning all teams.");
	}
	owl.serveOwlIcal(response, teams);
}

const server = http.createServer(onRequest);

server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});

