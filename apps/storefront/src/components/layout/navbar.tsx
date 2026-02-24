import Image from "next/image";
import Link from "next/link";
import {NavbarCollections} from '@/components/layout/navbar/navbar-collections';
import {NavbarCart} from '@/components/layout/navbar/navbar-cart';
import {NavbarUser} from '@/components/layout/navbar/navbar-user';
import {ThemeSwitcher} from '@/components/layout/navbar/theme-switcher';
import {NavbarChat} from '@/components/layout/navbar/navbar-chat';
import {Suspense} from "react";
import {SearchInput} from '@/components/layout/search-input';
import {NavbarUserSkeleton} from '@/components/shared/skeletons/navbar-user-skeleton';
import {SearchInputSkeleton} from '@/components/shared/skeletons/search-input-skeleton';
import {getAuthToken} from '@/lib/auth';

const VENDURE_BASE_URL = (process.env.VENDURE_SHOP_API_URL || process.env.NEXT_PUBLIC_VENDURE_SHOP_API_URL || '')
    .replace(/\/shop-api\/?$/, '');

export async function Navbar() {
    const authToken = await getAuthToken();

    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-xl font-bold">
                            <Image src="/vendure.svg" alt="Vendure" width={40} height={27} className="h-6 w-auto dark:invert" />
                        </Link>
                        <nav className="hidden md:flex items-center gap-6">
                            <Suspense>
                                <NavbarCollections/>
                            </Suspense>
                        </nav>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex">
                            <Suspense fallback={<SearchInputSkeleton />}>
                                <SearchInput/>
                            </Suspense>
                        </div>
                        <ThemeSwitcher />
                        <NavbarChat vendureUrl={VENDURE_BASE_URL} authToken={authToken} />
                        <Suspense>
                            <NavbarCart/>
                        </Suspense>
                        <Suspense fallback={<NavbarUserSkeleton />}>
                            <NavbarUser/>
                        </Suspense>
                    </div>
                </div>
            </div>
        </header>
    );
}
