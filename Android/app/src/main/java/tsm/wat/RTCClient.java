package tsm.wat;

import android.app.Activity;
import android.content.Context;
import android.media.AudioManager;
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
    private Activity mActivity;
    private boolean isStarted = false, isChannelReady = false;

    public RTCClient(Activity context, StreamListener streamListener) {
        AudioManager audioManager;
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        audioManager.setSpeakerphoneOn(true);
        mStreamListener = streamListener;
        mActivity = context;
        try {
            mSocket = IO.socket("http://159.203.114.155:80");
        } catch (URISyntaxException e) {
            e.printStackTrace();
        }

        Listeners listeners = new Listeners();
        PeerConnectionFactory.initializeAndroidGlobals(context, true, true,
                true, VideoRendererGui.getEGLContext());
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
                        peers.put(id, peer);
                        ReceiveObserver receiveObserver = new ReceiveObserver(id);
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
//                        if (! peers.containsKey(id)) return;
                        PeerConnection pc = peers.values().iterator().next().pc;
                        if (pc.getRemoteDescription() != null) {
                            IceCandidate candidate = new IceCandidate(
                                    id,
                                    data.getInt("label"),
                                    data.getString("candidate")
                            );
                            pc.addIceCandidate(candidate);
                        }
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
        private String id;
        public ReceiveObserver(String id) {
            this.id = id;
        }

        @Override
        public void onCreateSuccess(SessionDescription sdp) {
            Log.d(TAG, "Create success" + sdp.toString());
            try {
                JSONObject payload = new JSONObject();
                payload.put("type", sdp.type.canonicalForm());
                payload.put("sdp", sdp.description);
                sendMessage(payload);
                peers.get(id).pc.setLocalDescription(this, sdp);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }

        @Override
        public void onSetSuccess() {
            Log.d(TAG, "Set success");
        }

        @Override
        public void onCreateFailure(String s) {
            Log.d(TAG, "Create failure" + s);
        }

        @Override
        public void onSetFailure(String s) {
            Log.d(TAG, "Set failure" + s);
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
        public void onAddStream(final MediaStream mediaStream) {
            Log.d(TAG,"onAddStream "+mediaStream.label());
            RuntimeException e = new RuntimeException();
            e.printStackTrace();

            mActivity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    AudioTrack track = mediaStream.audioTracks.get(0);
                    track.setEnabled(true);
                    track.setState(MediaStreamTrack.State.LIVE);
                }
            });





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
