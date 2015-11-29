//
//  ViewController.m
//  WAT
//
//  Created by frank on 2015-11-27.
//  Copyright © 2015 joanne. All rights reserved.
//

#import "ViewController.h"
#import "SocketIOPacket.h"
#import "RTCICEServer.h"
#import "RTCPeerConnection.h"
#import "RTCPeerConnectionDelegate.h"
#import "RTCPeerConnectionFactory.h"
#import "RTCSessionDescription.h"
#import "RTCMediaConstraints.h"

#import "RTCICECandidate.h"
#import "RTCICEServer.h"
#import "RTCMediaConstraints.h"
#import "RTCMediaStream.h"
#import "RTCPair.h"
#import "RTCPeerConnection.h"
#import "RTCPeerConnectionDelegate.h"
#import "RTCPeerConnectionFactory.h"
#import "RTCSessionDescription.h"
#import "RTCVideoRenderer.h"
#import "RTCVideoCapturer.h"
#import "RTCSessionDescriptionDelegate.h"

#import "WAT-Swift.h"

@interface ViewController () <RTCPeerConnectionDelegate, RTCSessionDescriptionDelegate>

@property (weak, nonatomic) IBOutlet UITextField *textField;
@property(nonatomic, copy) NSString *baseURL;
@property(nonatomic, copy) NSString *pcConfig;
@property(nonatomic, assign) BOOL isStarted;
@property(nonatomic, assign) BOOL isChannelReady;
@property(nonatomic, strong) NSMutableArray *iceServers;
@property(nonatomic, strong) RTCPeerConnection *peerConnection;
@property(nonatomic, strong) RTCPeerConnectionFactory *peerConnectionFactory;
@property(nonatomic, strong) RTCMediaConstraints *pcConstraints;
@property(nonatomic, strong) RTCMediaConstraints *sdpConstraints;
@property(nonatomic, strong) NSMutableArray *candidates;

@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    
    //swift
//    SocketIOClient* socket = [[SocketIOClient alloc] initWithSocketURL:@"159.203.114.155" options:@{}];
//    
//    [socket on:@"connect" callback:^(NSArray* data, SocketAckEmitter* ack) {
//        NSLog(@"socket connected");
//    }];
//    
//    [socket connect];
    
    _socketIO = [[SocketIO alloc] initWithDelegate:self];
    [_socketIO connectToHost:@"159.203.114.155" onPort:80];
    _iceServers = [NSMutableArray array];
    _candidates = [NSMutableArray array];
    self.peerConnectionFactory = [[RTCPeerConnectionFactory alloc] init];
    [RTCPeerConnectionFactory initializeSSL];
    
    self.pcConstraints = [[RTCMediaConstraints alloc] initWithMandatoryConstraints:
                          @[] optionalConstraints:
                          @[[[RTCPair alloc] initWithKey:@"DtlsSrtpKeyAgreement" value:@"true"]]];
    
    self.pcConstraints = [[RTCMediaConstraints alloc] initWithMandatoryConstraints:
                          @[[[RTCPair alloc] initWithKey:@"OfferToReceiveAudio" value:@"true"],
                            [[RTCPair alloc] initWithKey:@"OfferToReceiveVideo" value:@"true"]]
                          optionalConstraints:@[]];
    
    RTCICEServer *ICEServer = [[RTCICEServer alloc] initWithURI:[NSURL URLWithString:@"stun:stun.l.google.com:19302"]
                                                       username:@""
                                                       password:@""];
    NSLog(@"Added ICE Server: %@", ICEServer);
    [self.iceServers addObject:ICEServer];
    
    [self updateTurn];
}

- (IBAction)buttonPressed:(id)sender {
    NSString *code = self.textField.text;
    [_socketIO sendEvent:@"join room" withData:code];
    self.textField.text = @"";
}

# pragma mark socket.IO-objc delegate methods

- (void) socketIODidConnect:(SocketIO *)socket {
    NSLog(@"socket.io connected.");
}

- (void) socketIO:(SocketIO *)socket didReceiveEvent:(SocketIOPacket *)packet {
    NSLog(@"didReceiveEvent()");
    
    if([packet.name isEqualToString:@"message"]) {
        NSArray* args = packet.args;
        NSDictionary* arg = args[0];
        NSString *msg = arg[0];
        
        if ([msg isEqualToString:@"got user media"]) {
            NSLog(@"socketIO got user media");
            [self maybeStart];
        } else if ([msg isEqualToString:@"offer"]) {
            NSLog(@"socketIO offer");
            if (!self.isStarted) {
                [self maybeStart];
            }
            NSString *sdpString = [args objectForKey:@"sdp"];
            RTCSessionDescription *sdp = [[RTCSessionDescription alloc]
                                          initWithType:msg sdp:[self preferISAC:sdpString]];
            [self.peerConnection setRemoteDescriptionWithDelegate:self sessionDescription:sdp];
        } else if ([msg isEqualToString:@"candidate"]) {
            NSLog(@"socketIO candidate");
            NSString *mid = [arg objectForKey:@"id"];
            NSNumber *sdpLineIndex = [arg objectForKey:@"label"];
            NSString *sdp = [arg objectForKey:@"candidate"];
            RTCICECandidate *candidate =
            [[RTCICECandidate alloc] initWithMid:mid
                                           index:sdpLineIndex.intValue
                                             sdp:sdp];
            [self.candidates addObject:candidate];
            [self.peerConnection createAnswerWithDelegate:self constraints:self.sdpConstraints];
        } else if ([msg isEqualToString:@"answer"]) {
            NSLog(@"socketIO answer");
            NSString *sdpString = [args objectForKey:@"sdp"];
            RTCSessionDescription *sdp = [[RTCSessionDescription alloc]
                                          initWithType:msg sdp:[self preferISAC:sdpString]];
            [self.peerConnection setRemoteDescriptionWithDelegate:self sessionDescription:sdp];
        } else if ([msg isEqualToString:@"join"]) {
            NSLog(@"socketIO join");
            self.isChannelReady = YES;
        } else if ([msg isEqualToString:@"bye"]) {
            NSLog(@"socketIO bye");
            [self disconnect];
        }
    }
}

- (void) socketIO:(SocketIO *)socket onError:(NSError *)error {
    NSLog(@"onError() %@", error);
}


- (void) socketIODidDisconnect:(SocketIO *)socket disconnectedWithError:(NSError *)error {
    NSLog(@"socket.io disconnected. did error occur? %@", error);
}

#pragma mark - RTCPeerConnectionDelegate

- (void)peerConnectionOnError:(RTCPeerConnection *)peerConnection {
    NSLog(@"PCO onError.");
    NSAssert(NO, @"PeerConnection failed.");
}

- (void)peerConnection:(RTCPeerConnection *)peerConnection
 signalingStateChanged:(RTCSignalingState)stateChanged {
    NSLog(@"PCO onSignalingStateChange: %d", stateChanged);
}

- (void)peerConnection:(RTCPeerConnection *)peerConnection
           addedStream:(RTCMediaStream *)stream {
    NSLog(@"PCO onAddStream.");
    dispatch_async(dispatch_get_main_queue(), ^(void) {
        NSAssert([stream.audioTracks count] >= 1,
                 @"Expected at least 1 audio stream");
        
//        if ([stream.videoTracks count] > 0) {
//            [[self videoView] renderVideoTrackInterface:[stream.videoTracks objectAtIndex:0]];
            //[[self delegate] whiteboardConnection:self renderRemoteVideo:[stream.videoTracks objectAtIndex:0]];
//        }
    });
}

- (void)peerConnection:(RTCPeerConnection *)peerConnection
         removedStream:(RTCMediaStream *)stream {
    NSLog(@"PCO onRemoveStream.");
    [stream removeVideoTrack:[stream.videoTracks objectAtIndex:0]];
}

- (void)
peerConnectionOnRenegotiationNeeded:(RTCPeerConnection *)peerConnection {
    NSLog(@"PCO onRenegotiationNeeded.");
    // TODO(hughv): Handle this.
}

- (void)peerConnection:(RTCPeerConnection *)peerConnection
       gotICECandidate:(RTCICECandidate *)candidate {
    NSLog(@"PCO onICECandidate.\n  Mid[%@] Index[%ld] Sdp[%@]",
          candidate.sdpMid,
          (long)candidate.sdpMLineIndex,
          candidate.sdp);
    NSDictionary *json =
    @{ @"type" : @"candidate",
       @"label" : [NSNumber numberWithInt:candidate.sdpMLineIndex],
       @"id" : candidate.sdpMid,
       @"candidate" : candidate.sdp };
    NSError *error;
    NSData *data =
    [NSJSONSerialization dataWithJSONObject:json options:0 error:&error];
    if (!error) {
        [self sendData:data];
    } else {
        NSAssert(NO, @"Unable to serialize JSON object with error: %@",
                 error.localizedDescription);
    }
}

- (void)peerConnection:(RTCPeerConnection *)peerConnection
   iceGatheringChanged:(RTCICEGatheringState)newState {
    NSLog(@"PCO onIceGatheringChange. %d", newState);
}

- (void)peerConnection:(RTCPeerConnection *)peerConnection
  iceConnectionChanged:(RTCICEConnectionState)newState {
    NSLog(@"PCO onIceConnectionChange. %d", newState);
    if (newState == RTCICEConnectionConnected)
        NSLog(@"ICE Connection Connected.");
    NSAssert(newState != RTCICEConnectionFailed, @"ICE Connection failed!");
}

-(void)peerConnection:(RTCPeerConnection *)peerConnection didOpenDataChannel:(RTCDataChannel *)dataChannel {
    
}

#pragma mark - private methods

- (void)sendData:(NSData *)data {
    [self.socketIO sendEvent:@"message" withData:data];
}

- (void)maybeStart {
    if (!self.isStarted && self.isChannelReady) {
        [self createPeerConnection];
        self.isStarted = YES;
    }
}

-(void)createPeerConnection {
    self.peerConnection = [self.peerConnectionFactory peerConnectionWithICEServers:self.iceServers
                                                 constraints:self.pcConstraints
                                                    delegate:self];
    
}

-(void)updateTurn {
    RTCICEServer *ICEServer = [[RTCICEServer alloc] initWithURI:[NSURL URLWithString:@"turn:162.222.183.171:3478?transport=udp"]
                                                       username:@"1445297176:41784574"
                                                       password:@"VYyTBdH7bm/jpFt6PikqKwlopUE="];
    [self.iceServers addObject:ICEServer];
}

-(void)disconnect {
    NSLog(@"disconnect");
    [self sendData:[@"{\"type\": \"bye\"}" dataUsingEncoding:NSUTF8StringEncoding]];
    self.peerConnection = nil;
    self.peerConnectionFactory = nil;
    self.isStarted = NO;
    self.isChannelReady = NO;
    [RTCPeerConnectionFactory deinitializeSSL];
}

// copyright something

- (NSString *)preferISAC:(NSString *)origSDP {
    int mLineIndex = -1;
    NSString* isac16kRtpMap = nil;
    NSArray* lines = [origSDP componentsSeparatedByString:@"\n"];
    NSRegularExpression* isac16kRegex = [NSRegularExpression
                                         regularExpressionWithPattern:@"^a=rtpmap:(\\d+) ISAC/16000[\r]?$"
                                         options:0
                                         error:nil];
    for (int i = 0;
         (i < [lines count]) && (mLineIndex == -1 || isac16kRtpMap == nil);
         ++i) {
        NSString* line = [lines objectAtIndex:i];
        if ([line hasPrefix:@"m=audio "]) {
            mLineIndex = i;
            continue;
        }
        isac16kRtpMap = [self firstMatch:isac16kRegex withString:line];
    }
    if (mLineIndex == -1) {
        NSLog(@"No m=audio line, so can't prefer iSAC");
        return origSDP;
    }
    if (isac16kRtpMap == nil) {
        NSLog(@"No ISAC/16000 line, so can't prefer iSAC");
        return origSDP;
    }
    NSArray* origMLineParts =
    [[lines objectAtIndex:mLineIndex] componentsSeparatedByString:@" "];
    NSMutableArray* newMLine =
    [NSMutableArray arrayWithCapacity:[origMLineParts count]];
    int origPartIndex = 0;
    // Format is: m=<media> <port> <proto> <fmt> ...
    [newMLine addObject:[origMLineParts objectAtIndex:origPartIndex++]];
    [newMLine addObject:[origMLineParts objectAtIndex:origPartIndex++]];
    [newMLine addObject:[origMLineParts objectAtIndex:origPartIndex++]];
    [newMLine addObject:isac16kRtpMap];
    for (; origPartIndex < [origMLineParts count]; ++origPartIndex) {
        if ([isac16kRtpMap compare:[origMLineParts objectAtIndex:origPartIndex]]
            != NSOrderedSame) {
            [newMLine addObject:[origMLineParts objectAtIndex:origPartIndex]];
        }
    }
    NSMutableArray* newLines = [NSMutableArray arrayWithCapacity:[lines count]];
    [newLines addObjectsFromArray:lines];
    [newLines replaceObjectAtIndex:mLineIndex
                        withObject:[newMLine componentsJoinedByString:@" "]];
    return [newLines componentsJoinedByString:@"\n"];
}

- (NSString *)firstMatch:(NSRegularExpression *)pattern
              withString:(NSString *)string {
    NSTextCheckingResult* result =
    [pattern firstMatchInString:string
                        options:0
                          range:NSMakeRange(0, [string length])];
    if (!result)
        return nil;
    return [string substringWithRange:[result rangeAtIndex:1]];
}


@end
