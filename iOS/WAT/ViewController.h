//
//  ViewController.h
//  WAT
//
//  Created by frank on 2015-11-27.
//  Copyright © 2015 joanne. All rights reserved.
//

#import <UIKit/UIKit.h>
#import "SocketIO.h"

@interface ViewController : UIViewController <SocketIODelegate>
@property (nonatomic, strong) SocketIO *socketIO;


@end

