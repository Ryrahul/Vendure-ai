'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';
import '@rahul_vendure/ai-chat-react/styles.css';

interface NavbarChatProps {
    vendureUrl: string;
    authToken?: string;
    channelToken?: string;
}

export function NavbarChat({ vendureUrl, authToken, channelToken }: NavbarChatProps) {
    const router = useRouter();

    return (
        <VendureAiChat
            vendureUrl={vendureUrl}
            authToken={authToken}
            channelToken={channelToken}
            onCartUpdate={() => router.refresh()}
            onAddToCart={async (variantId, quantity, productName) => {
                const { addToCart } = await import('@/app/product/[slug]/actions');
                const result = await addToCart(variantId, quantity);
                if (result.success) {
                    toast.success('Added to cart', {
                        description: `${productName} has been added to your cart`,
                    });
                    router.refresh();
                } else {
                    toast.error('Error', {
                        description: result.error || 'Failed to add item to cart',
                    });
                }
            }}
            onNavigate={(path) => router.push(path)}
        />
    );
}
