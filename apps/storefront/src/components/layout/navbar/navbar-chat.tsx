'use client';

import {useState} from 'react';
import {MessageCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet, SheetTrigger} from '@/components/ui/sheet';
import {ChatPanel} from '@/components/chat/chat-panel';

export function NavbarChat() {
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" type="button">
                    <MessageCircle className="h-5 w-5" />
                    <span className="sr-only">AI Assistant</span>
                </Button>
            </SheetTrigger>
            <ChatPanel onClose={() => setOpen(false)} />
        </Sheet>
    );
}
