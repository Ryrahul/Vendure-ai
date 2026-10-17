import { InitialData, LanguageCode } from '@vendure/core';

export const initialData: InitialData = {
    defaultLanguage: LanguageCode.en,
    defaultZone: 'Europe',
    taxRates: [{ name: 'Standard Tax', percentage: 20 }],
    shippingMethods: [{ name: 'Standard Shipping', price: 500 }],
    paymentMethods: [],
    countries: [{ name: 'United Kingdom', code: 'GB', zone: 'Europe' }],
    collections: [
        {
            name: 'Electronics',
            filters: [{ code: 'facet-value-filter', args: { facetValueNames: ['electronics'], containsAny: false } }],
        },
    ],
};
