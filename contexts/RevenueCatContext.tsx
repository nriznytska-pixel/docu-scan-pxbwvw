
import React, { createContext, useContext, useEffect, useState } from 'react';
import Purchases, { LOG_LEVEL, CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';

interface RevenueCatContextType {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  isPremium: boolean;
  loading: boolean;
  purchasePackage: (packageId: string) => Promise<boolean>;
  restorePurchases: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

const API_KEY = 'appl_XxGjHrGsmWmCpdYrAQysnBxrThb';

export function RevenueCatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);

  const isPremium = customerInfo?.entitlements?.active?.premium !== undefined;

  useEffect(() => {
    const init = async () => {
      try {
        console.log('RevenueCat: Initializing SDK');
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        await Purchases.configure({ apiKey: API_KEY });
        console.log('RevenueCat: SDK configured');
        
        if (user?.id) {
          console.log('RevenueCat: Logging in user:', user.id);
          await Purchases.logIn(user.id);
        }

        const info = await Purchases.getCustomerInfo();
        console.log('RevenueCat: Customer info retrieved, isPremium:', info.entitlements.active.premium !== undefined);
        setCustomerInfo(info);

        const offs = await Purchases.getOfferings();
        if (offs.current) {
          console.log('RevenueCat: Offerings retrieved:', offs.current.identifier);
          setOfferings(offs.current);
        } else {
          console.log('RevenueCat: No current offerings available');
        }
      } catch (e) {
        console.error('RevenueCat init error:', e);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [user]);

  const purchasePackage = async (packageId: string): Promise<boolean> => {
    try {
      console.log('RevenueCat: Attempting to purchase package:', packageId);
      const pkg = offerings?.availablePackages.find(p => p.identifier === packageId);
      if (!pkg) {
        console.error('RevenueCat: Package not found:', packageId);
        return false;
      }
      
      const { customerInfo: newInfo } = await Purchases.purchasePackage(pkg);
      console.log('RevenueCat: Purchase successful, isPremium:', newInfo.entitlements.active.premium !== undefined);
      setCustomerInfo(newInfo);
      return newInfo.entitlements.active.premium !== undefined;
    } catch (e) {
      console.error('RevenueCat: Purchase error:', e);
      return false;
    }
  };

  const restorePurchases = async () => {
    try {
      console.log('RevenueCat: Restoring purchases');
      const info = await Purchases.restorePurchases();
      console.log('RevenueCat: Purchases restored, isPremium:', info.entitlements.active.premium !== undefined);
      setCustomerInfo(info);
    } catch (e) {
      console.error('RevenueCat: Restore error:', e);
    }
  };

  return (
    <RevenueCatContext.Provider value={{ customerInfo, offerings, isPremium, loading, purchasePackage, restorePurchases }}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export const useRevenueCat = () => {
  const context = useContext(RevenueCatContext);
  if (!context) throw new Error('useRevenueCat must be used within RevenueCatProvider');
  return context;
};
