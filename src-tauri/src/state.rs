use crate::models::{AppSettings, StockItem};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

#[derive(Default)]
pub struct AppState {
    pub stock: Mutex<Vec<StockItem>>,
}

impl AppState {
    pub fn load_settings(&self, app: &AppHandle) -> Result<AppSettings, String> {
        let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
        match store.get(SETTINGS_KEY) {
            Some(value) => serde_json::from_value(value.clone()).map_err(|e| e.to_string()),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
        let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
        store.set(
            SETTINGS_KEY,
            serde_json::to_value(settings).map_err(|e| e.to_string())?,
        );
        store.save().map_err(|e| e.to_string())
    }

    pub fn push_stock(&self, item: StockItem) {
        let mut stock = self.stock.lock().unwrap();
        stock.insert(0, item);
        if stock.len() > 50 {
            stock.truncate(50);
        }
    }

    pub fn list_stock(&self) -> Vec<StockItem> {
        self.stock.lock().unwrap().clone()
    }

    pub fn delete_stock_item(&self, id: &str) -> Option<StockItem> {
        let mut stock = self.stock.lock().unwrap();
        if let Some(index) = stock.iter().position(|item| item.id == id) {
            Some(stock.remove(index))
        } else {
            None
        }
    }

    pub fn clear_stock(&self) -> Vec<StockItem> {
        let mut stock = self.stock.lock().unwrap();
        std::mem::take(&mut *stock)
    }
}
