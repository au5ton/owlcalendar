const owl = require('./owlcalendar');

const http = require('http');
const handler = require('serve-handler');

var getIP = require('ipware')().get_ip;

//const hostname = '127.0.0.1';
const hostname = '0.0.0.0';
const port = 3000;

function onRequest(request, response) {
	try {
		var ipInfo = getIP(request);
		var clientIp = ipInfo.clientIp;

		owl.serveRequest(clientIp, request, response);
	} catch (exception) {
		console.log("Exception while serving index: " + exception.stack);
		response.end();
	}
}

const server = http.createServer(onRequest);

owl.init(function() {
	server.listen(port, hostname, () => {
		console.log(`Server running at http://${hostname}:${port}/`);
	});
});

