//
//  ViewController.m
//  WAT
//
//  Created by frank on 2015-11-27.
//  Copyright © 2015 joanne. All rights reserved.
//

#import "ViewController.h"
#import "SocketIOPacket.h"

@interface ViewController ()

@property (weak, nonatomic) IBOutlet UITextField *textField;

@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    
    _socketIO = [[SocketIO alloc] initWithDelegate:self];
    [_socketIO connectToHost:@"159.203.114.155" onPort:80];
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
//        NSArray* args = packet.args;
//        NSDictionary* arg = args[0];
    }
}

- (void) socketIO:(SocketIO *)socket onError:(NSError *)error {
    NSLog(@"onError() %@", error);
}


- (void) socketIODidDisconnect:(SocketIO *)socket disconnectedWithError:(NSError *)error {
    NSLog(@"socket.io disconnected. did error occur? %@", error);
}

@end
