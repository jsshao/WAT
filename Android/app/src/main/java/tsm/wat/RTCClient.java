package tsm.wat;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.webrtc.AudioTrack;
import org.webrtc.DataChannel;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.MediaStreamTrack;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.VideoRendererGui;

import java.net.URISyntaxException;
import java.util.HashMap;
import java.util.LinkedList;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

public class RTCClient {
    public interface StreamListener {
        void OnStreamAdded(MediaStream stream);
    }

    private StreamListener mStreamListener;
    private static final String TAG = "RTC CLIENT TAG";
    private Socket mSocket;
    private HashMap<String, Peer> peers = new HashMap<>();
    private PeerConnectionFactory factory;
    private LinkedList<PeerConnection.IceServer> iceServers = new LinkedList<>();
    private MediaConstraints pcConstraints = new MediaConstraints();
    private MediaConstraints sdpConstraints = new MediaConstraints();
    private PeerConnectionParameters pcParams;
    private boolean isStarted = false, isChannelReady = false;

    public RTCClient(Context context, PeerConnectionParameters params, StreamListener streamListener) {
        mStreamListener = streamListener;
        pcParams = params;
        try {
            mSocket = IO.socket("http://159.203.114.155:80");
        } catch (URISyntaxException e) {
            e.printStackTrace();
        }

        Listeners listeners = new Listeners();
        PeerConnectionFactory.initializeAndroidGlobals(context, true, true,
                params.videoCodecHwAcceleration, VideoRendererGui.getEGLContext());
        factory = new PeerConnectionFactory();

        mSocket.on(Socket.EVENT_CONNECT_ERROR, listeners.connectErrorListener);
        mSocket.on("joined", listeners.joinListener);
        mSocket.on("connect", listeners.connectedListener);
        mSocket.on("message_v2", listeners.onMessageListener);
        mSocket.connect();

        iceServers.add(new PeerConnection.IceServer("stun:stun.l.google.com:19302"));
        iceServers.add(new PeerConnection.IceServer("turn:198.199.78.57:2222?transport=udp", "username", "password"));

        sdpConstraints.mandatory.add(new MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"));
        sdpConstraints.mandatory.add(new MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"));
        pcConstraints.optional.add(new MediaConstraints.KeyValuePair("DtlsSrtpKeyAgreement", "true"));
    }

    public void joinRoom(String name) {
        Log.d("=======================================================", "Trying to join room " + name);
        mSocket.emit("join room", name);
    }


    private class Listeners {
        public Emitter.Listener connectErrorListener = new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.d("=======================================================", "Connection error");
                for (Object arg : args) {
                    ((Exception) arg).printStackTrace();
                }
            }
        };

        public Emitter.Listener joinListener = new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.d("=======================================================", "Joined the room");
                isChannelReady = true;
            }
        };

        public Emitter.Listener connectedListener = new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.d("=======================================================", "Connected");
            }
        };

        public Emitter.Listener onMessageListener = new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                JSONArray dataArray = (JSONArray) args[0];
                try {
                    String id = dataArray.getString(1);
                    JSONObject data = dataArray.getJSONObject(0);
                    String type = data.getString("type");

                    if (type.equals("got user media")) {
                        maybeStart(id);
                    } else if (type.equals("offer")) {
                        // offer == we got an offer, create an answer to the offer
                        Log.d(TAG,"Offer message");
                        Peer peer = maybeStart(id);
                        ReceiveObserver receiveObserver = new ReceiveObserver();
                        SessionDescription sdp = new SessionDescription(
                                SessionDescription.Type.fromCanonicalForm(data.getString("type")),
                                data.getString("sdp")
                        );
                        if ( peer != null ) {
                            peer.pc.setRemoteDescription(receiveObserver, sdp);
                            peer.pc.createAnswer(receiveObserver, sdpConstraints);
                        }
                    } else if (type.equals("candidate")) {
                        Log.d(TAG,"AddIceCandidateCommand");
                        PeerConnection pc = peers.get(id).pc;
                        if (pc.getRemoteDescription() != null) {
                            IceCandidate candidate = new IceCandidate(
                                    id,
                                    data.getInt("label"),
                                    data.getString("candidate")
                            );
                            pc.addIceCandidate(candidate);
                        }
                    } else if (type.equals("answer")) {
                        // offer == got an answer back after we make an offer, now we can set remote SDP Command
                        Log.d(TAG,"CreateAnswerCommand");
                        ReceiveObserver receiveObserver = new ReceiveObserver();
                        Peer peer = peers.get(id);
                        SessionDescription sdp = new SessionDescription(
                                SessionDescription.Type.fromCanonicalForm(data.getString("type")),
                                data.getString("sdp")
                        );
                        peer.pc.setRemoteDescription(receiveObserver, sdp);
                        peer.pc.createAnswer(receiveObserver, pcConstraints);
                    } else if (type.equals("init")) {
                        // init == client creates an offer to send to peer
                        Log.d(TAG,"INIT, SHOULDNT HAPPEN");
                    }
                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        };
    }

    private Peer maybeStart(String id) {
        if (!isStarted && isChannelReady) {
            Peer peer = addPeer(id);
            peers.put(id, peer);
            isStarted = true;
            return peer;
        }
        return null;
    }

    public void sendMessage(JSONObject msg) throws JSONException {
        Log.d(TAG, "Sending message " + msg.toString());
        mSocket.emit("message", msg);
    }

    private Peer addPeer(String id) {
        Peer peer = new Peer(id);
        peers.put(id, peer);
        return peer;
    }

    private void removePeer(String id) {
        Peer peer = peers.get(id);
//        mListener.onRemoveRemoteStream(peer.endPoint);
        peer.pc.close();
        peers.remove(peer.id);
    }


    private class ReceiveObserver implements SdpObserver {
        public ReceiveObserver() {
        }

        @Override
        public void onCreateSuccess(SessionDescription sdp) {
        }

        @Override
        public void onSetSuccess() {

        }

        @Override
        public void onCreateFailure(String s) {

        }

        @Override
        public void onSetFailure(String s) {

        }
    }

    private class Peer implements PeerConnection.Observer {
        private PeerConnection pc;
        private String id;

        @Override
        public void onSignalingChange(PeerConnection.SignalingState signalingState) {
            Log.d(TAG, "Signalling state changed" + signalingState.toString());
        }

        @Override
        public void onIceConnectionChange(PeerConnection.IceConnectionState iceConnectionState) {
            Log.d(TAG, "Connection state changed " + iceConnectionState.toString());
            if(iceConnectionState == PeerConnection.IceConnectionState.DISCONNECTED) {
//                removePeer(id);
//                mListener.onStatusChanged("DISCONNECTED");
            }
        }

        @Override
        public void onIceGatheringChange(PeerConnection.IceGatheringState iceGatheringState) {}

        @Override
        public void onIceCandidate(final IceCandidate candidate) {
            try {
                JSONObject payload = new JSONObject();
                payload.put("label", candidate.sdpMLineIndex);
                payload.put("id", candidate.sdpMid);
                payload.put("candidate", candidate.sdp);
                payload.put("type", "candidate");
                sendMessage(payload);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }

        @Override
        public void onAddStream(MediaStream mediaStream) {
            Log.d(TAG,"onAddStream "+mediaStream.label());
            AudioTrack track = mediaStream.audioTracks.get(0);
            track.setEnabled(true);
            track.setState(MediaStreamTrack.State.LIVE);
//            mStreamListener.OnStreamAdded(mediaStream);
            // remote streams are displayed from 1 to MAX_PEER (0 is localStream)
//            mListener.onAddRemoteStream(mediaStream, endPoint+1);
        }

        @Override
        public void onRemoveStream(MediaStream mediaStream) {
            Log.d(TAG,"onRemoveStream "+mediaStream.label());
//            removePeer(id);
        }

        @Override
        public void onDataChannel(DataChannel dataChannel) {
            Log.d(TAG,"data channel "+ dataChannel.label());
        }

        @Override
        public void onRenegotiationNeeded() {}

        public Peer(String id) {
            Log.d(TAG,"new Peer: "+id);
            this.pc = factory.createPeerConnection(iceServers, pcConstraints, this);
            this.id = id;
//            mListener.onStatusChanged("CONNECTING");
        }
    }
}
