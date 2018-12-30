process.title='Messenger'

var websocketPort=3001
var websocketServer=require('websocket').server

var history=[];
var clients=[]

function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var colors = [ 'red', 'green', 'blue', 'magenta', 'purple', 'plum', 'orange' ];
colors.sort(function(a,b) { return Math.random() > 0.5; } );



var http=require('http');
var fs=require('fs');
var path=require('path');

var server=http.createServer(function(request,response){

    var fileName=path.basename(request.url) || 'index.html';
    var fullPath=__dirname+'/src/'+fileName;
    console.log('Request for '+fullPath+' received.');

    fs.exists(fullPath,function(exists){
    	if (exists) {
	    	fs.readFile(fullPath,function(error,fileBinary){
		        if (error){
		            console.log(error);
		            response.writeHead(200,{
		                'Content-Type':'text/html'
		            });
		            response.write('no such file');
		        }else {
		            response.writeHead(200,{
		                'Content-Type':'text/html'
		            });
		            response.write(fileBinary.toString());
		        }
		        response.end();
		    });
	    }else {
	    	console.log('url error occurs')
	    }
    })
    
})
console.log('Server running at http://localhost:80/');

server.listen(websocketPort,function(){
	console.log( (new Date())+" Server is listening on port "+websocketPort )
})

var ws=new websocketServer({
	httpServer:server
})

ws.on('request',function(request){
	console.log((new Date())+" Connection from origin "+request.origin+'.');

	var connection=request.accept(null,request.origin)

	var index=clients.push(connection)-1
	var userName=false;
	var userColor=false;

	console.log((new Date()) + ' Connection accepted.');

	if (history.length>0) {
		connection.sendUTF(JSON.stringify({
			type:'history',
			data:history
		}))
	}

	connection.on('message',function(message){
		if (message.type==='utf8') {
			if (userName===false) {
				userName=htmlEntities(message.utf8Data);
				userColor=colors.shift()
				connection.sendUTF(JSON.stringify({
					type:'color',
					data:'userColor'
				}))
				console.log((new Date()) + ' User is known as: ' + userName + ' with ' + userColor + ' color.');
			}else {
				console.log((new Date()) + ' Received Message from ' + userName + ': ' + message.utf8Data);
				var obj={
					time:(new Date()).getTime(),
					text:htmlEntities(message.utf8Data),
					author:userName,
					color:userColor
				}
				history.push(obj)
				history=history.slice(-100)

				var json=JSON.stringify({
					type:'message', 
					data: obj 
				});
				for (var i=0;i<clients.length;i++){
					clients[i].sendUTF(json)
				}
			}
		}
	})

	connection.on('close', function(connection) {
        if (userName !== false && userColor !== false) {
            console.log((new Date()) + " Peer "
                + connection.remoteAddress + " disconnected.");
            // remove user from the list of connected clients
            clients.splice(index, 1);
            // push back user's color to be reused by another user
            colors.push(userColor);
        }
    });
})