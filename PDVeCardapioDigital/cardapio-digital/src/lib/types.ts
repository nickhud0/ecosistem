export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_name: string;
  category_id?: string | null;
  emoji?: string;
  sold_out: boolean;
  description?: string;
  details?: string[];
  created_at?: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: string;
  min_selectable: number;
  max_selectable: number;
  options: ModifierOption[];
}

export interface RestaurantInfo {
  name: string;
  description: string;
  logo: string;
  phone?: string;
  address?: string;
  isOpen: boolean;
  wifiNetwork?: string;
  wifiPassword?: string;
  businessHours?: string;
  averageTime?: string;
}
