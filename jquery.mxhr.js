;(function($) {
    $.mxhr = function(options) {
        var url = options.url,
            pong = null,
            lastLength = 0,
            streams = [],
            listeners = {},
            req,
            boundary,
            type = options.type || 'GET',
            data = $.param(options.data) || false,
            csrfToken = $("meta[name='csrf-token']").attr("content");

        var readyStateNanny = function() {
            if(req.readyState == 3 && pong == null) {
                var contentTypeHeader = req.getResponseHeader("Content-Type");

                //No HTTP error, just a bad response
                if(contentTypeHeader.indexOf("multipart/mixed") == -1) {
                    req.onreadystatechange = function() {
                        req.onreadystatechange = function() {};
                        throw new Error('Send it as multipart/mixed, genius.');
                    }

                } else {
                    boundary = '--' + /boundary=([^\x3B]+)/.exec(contentTypeHeader)[1];

                    //Start pinging
                    pong = window.setInterval(ping, 15);
                }
            }

            if(req.readyState == 4) {
                //Stop the insanity!
                clearInterval(pong);

                //One last ping to clean up
                ping();
            }
        }

        var ping = function() {
            var length = req.responseText.length,
                packet = req.responseText.substring(lastLength, length);

            processPacket(packet);
            lastLength = length;
        }

        var processPacket = function(packet) {
            if(packet.length < 1) return;

            //I don't know if we can count on this, but it's fast as hell
            var startFlag = packet.indexOf(boundary),
                endFlag = -1;

            //Is there a startFlag?
            if(startFlag > -1) {
                if(typeof currentStream != 'undefined') {
                //If there's an open stream, that's an endFlag, not a startFlag
                    endFlag = startFlag;
                    startFlag = -1;
                } else {
                //No open stream? Ok, valid startFlag. Let's try find an endFlag then.
                    endFlag = packet.indexOf(boundary, startFlag + boundary.length);
                }
            }

            //No stream is open
            if(typeof currentStream == 'undefined') {
                //Open a stream
                currentStream = '';

                //Is there a start flag?
                if(startFlag > -1) {
                //Yes
                    //Is there an end flag?
                    if(endFlag > -1) {
                    //Yes
                        //Use the end flag to grab the entire payload in one swoop
                        var payload = packet.substring(startFlag, endFlag);
                        currentStream += payload;

                        //Remove the payload from this chunk
                        packet = packet.replace(payload, '');

                        closeCurrentStream();

                        //Start over on the remainder of this packet
                        processPacket(packet);
                    } else {
                    //No
                        //Grab from the start of the start flag to the end of the chunk
                        currentStream += packet.substr(startFlag);

                        //Leave this.currentStream set and wait for another packet
                    }
                } else {
                    //WTF? No open stream and no start flag means someone fucked up the output
                    //...OR maybe they're sending garbage in front of their first payload. Weird.
                    //I guess just ignore it for now?
                }
            //Else we have an open stream
            } else {
                //Is there an end flag?
                if(endFlag > -1) {
                //Yes
                    //Use the end flag to grab the rest of the payload
                    var chunk = packet.substring(0, endFlag);
                    currentStream += chunk;

                    //Remove the rest of the payload from this chunk
                    packet = packet.replace(chunk, '');

                    closeCurrentStream();

                    //Start over on the remainder of this packet
                    processPacket(packet);
                } else {
                //No
                    //Put this whole packet into this.currentStream
                    currentStream += packet;

                    //Wait for another packet to ping() through...
                }
            }
        }

        var closeCurrentStream = function() {
            //Write stream. Not sure if we need this
            //streams.push(currentStream);

            //Get mimetype
            //First, ditch the boundary
            currentStream = currentStream.replace(boundary + "\n", '');

            /* The mimetype is the first line after the boundary.
               Note that RFC 2046 says that there's either a mimetype here or a blank line to default to text/plain,
               so if the payload starts on the line after the boundary, we'll intentionally ditch that line
               because it doesn't conform to the spec. QQ more noob, L2play, etc. */
            var mimeAndPayload = currentStream.split("\n");

            //Handle multiple headers per payload
            var headers = {};
            while(/^[-a-z0-9]+:/i.test(mimeAndPayload[0])) {
                var header = mimeAndPayload.shift().split(':');

                headers[header[0]] = $.trim(header[1]);
            }

            //Better to have this null than undefined
            var mime = headers['Content-Type'] ? headers['Content-Type'] : null;

            //Let's make things a bit easier here
            var selector = headers['X-MXHR-Selector'] ? headers['X-MXHR-Selector'] : document;

            //Get payload
            var payload = mimeAndPayload.join("\n");

            if(options[mime]) {
                options[mime].apply(this, [payload]);
            };

            delete currentStream;
        }

        //These versions of XHR are known to work with MXHR
        try { req = new ActiveXObject('MSXML2.XMLHTTP.6.0'); } catch(nope) {
            try { req = new ActiveXObject('MSXML3.XMLHTTP'); } catch(nuhuh) {
                try { req = new XMLHttpRequest(); } catch(noway) {
                    throw new Error('Could not find supported version of XMLHttpRequest.');
                }
            }
        }

        //These versions don't support readyState == 3 header requests
        //try { req = new ActiveXObject('Microsoft.XMLHTTP'); } catch(err) {}
        //try { req = new ActiveXObject('MSXML2.XMLHTTP.3.0'); } catch(err) {}

        req.open(type, url, true);
        req.onreadystatechange = readyStateNanny;

        if(csrfToken) {
            req.setRequestHeader("X-CSRF-Token", csrfToken);
        }

        req.send(data ? data : null);
    };
})(jQuery);
