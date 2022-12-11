export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      apikeys: {
        Row: {
          id: number
          created_at: string | null
          user_id: string
          key: string
          mode: Database["public"]["Enums"]["key_mode"]
          updated_at: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          user_id: string
          key: string
          mode: Database["public"]["Enums"]["key_mode"]
          updated_at?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          user_id?: string
          key?: string
          mode?: Database["public"]["Enums"]["key_mode"]
          updated_at?: string | null
        }
      }
      app_stats: {
        Row: {
          app_id: string
          user_id: string
          created_at: string | null
          updated_at: string | null
          channels: number
          mlu: number
          versions: number
          shared: number
          mlu_real: number
          devices: number
          date_id: string
          version_size: number
          bandwidth: number
          devices_real: number
        }
        Insert: {
          app_id: string
          user_id: string
          created_at?: string | null
          updated_at?: string | null
          channels?: number
          mlu?: number
          versions?: number
          shared?: number
          mlu_real?: number
          devices?: number
          date_id?: string
          version_size?: number
          bandwidth?: number
          devices_real?: number
        }
        Update: {
          app_id?: string
          user_id?: string
          created_at?: string | null
          updated_at?: string | null
          channels?: number
          mlu?: number
          versions?: number
          shared?: number
          mlu_real?: number
          devices?: number
          date_id?: string
          version_size?: number
          bandwidth?: number
          devices_real?: number
        }
      }
      app_stats_onprem: {
        Row: {
          app_id: string
          created_at: string | null
          updated_at: string | null
          mlu: number | null
          versions: number | null
          mlu_real: number | null
          date_id: string
          devices: number | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          updated_at?: string | null
          mlu?: number | null
          versions?: number | null
          mlu_real?: number | null
          date_id: string
          devices?: number | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          updated_at?: string | null
          mlu?: number | null
          versions?: number | null
          mlu_real?: number | null
          date_id?: string
          devices?: number | null
        }
      }
      app_versions: {
        Row: {
          id: number
          created_at: string | null
          app_id: string
          name: string
          bucket_id: string | null
          user_id: string
          updated_at: string | null
          deleted: boolean
          external_url: string | null
          checksum: string | null
          session_key: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          app_id: string
          name: string
          bucket_id?: string | null
          user_id: string
          updated_at?: string | null
          deleted?: boolean
          external_url?: string | null
          checksum?: string | null
          session_key?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          app_id?: string
          name?: string
          bucket_id?: string | null
          user_id?: string
          updated_at?: string | null
          deleted?: boolean
          external_url?: string | null
          checksum?: string | null
          session_key?: string | null
        }
      }
      app_versions_meta: {
        Row: {
          created_at: string | null
          app_id: string
          user_id: string
          updated_at: string | null
          checksum: string
          size: number
          id: number
          devices: number | null
        }
        Insert: {
          created_at?: string | null
          app_id: string
          user_id: string
          updated_at?: string | null
          checksum: string
          size: number
          id?: number
          devices?: number | null
        }
        Update: {
          created_at?: string | null
          app_id?: string
          user_id?: string
          updated_at?: string | null
          checksum?: string
          size?: number
          id?: number
          devices?: number | null
        }
      }
      apps: {
        Row: {
          created_at: string | null
          app_id: string
          icon_url: string
          user_id: string
          name: string | null
          last_version: string | null
          updated_at: string | null
          id: string | null
        }
        Insert: {
          created_at?: string | null
          app_id: string
          icon_url: string
          user_id: string
          name?: string | null
          last_version?: string | null
          updated_at?: string | null
          id?: string | null
        }
        Update: {
          created_at?: string | null
          app_id?: string
          icon_url?: string
          user_id?: string
          name?: string | null
          last_version?: string | null
          updated_at?: string | null
          id?: string | null
        }
      }
      channel_devices: {
        Row: {
          created_at: string | null
          channel_id: number
          app_id: string
          updated_at: string
          created_by: string
          device_id: string
        }
        Insert: {
          created_at?: string | null
          channel_id: number
          app_id: string
          updated_at?: string
          created_by: string
          device_id: string
        }
        Update: {
          created_at?: string | null
          channel_id?: number
          app_id?: string
          updated_at?: string
          created_by?: string
          device_id?: string
        }
      }
      channel_users: {
        Row: {
          id: number
          created_at: string | null
          user_id: string
          channel_id: number
          app_id: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          user_id: string
          channel_id: number
          app_id: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          user_id?: string
          channel_id?: number
          app_id?: string
          updated_at?: string
          created_by?: string | null
        }
      }
      channels: {
        Row: {
          id: number
          created_at: string
          name: string
          app_id: string
          version: number
          created_by: string
          updated_at: string
          public: boolean
          disableAutoUpdateUnderNative: boolean
          disableAutoUpdateToMajor: boolean
          beta: boolean
          ios: boolean
          android: boolean
          allow_device_self_set: boolean
          allow_emulator: boolean
          allow_dev: boolean
        }
        Insert: {
          id?: number
          created_at?: string
          name: string
          app_id: string
          version: number
          created_by: string
          updated_at?: string
          public?: boolean
          disableAutoUpdateUnderNative?: boolean
          disableAutoUpdateToMajor?: boolean
          beta?: boolean
          ios?: boolean
          android?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          allow_dev?: boolean
        }
        Update: {
          id?: number
          created_at?: string
          name?: string
          app_id?: string
          version?: number
          created_by?: string
          updated_at?: string
          public?: boolean
          disableAutoUpdateUnderNative?: boolean
          disableAutoUpdateToMajor?: boolean
          beta?: boolean
          ios?: boolean
          android?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          allow_dev?: boolean
        }
      }
      deleted_account: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
      }
      devices: {
        Row: {
          created_at: string | null
          updated_at: string | null
          device_id: string
          version: number
          app_id: string
          platform: Database["public"]["Enums"]["platform_os"] | null
          plugin_version: string
          os_version: string | null
          date_id: string | null
          version_build: string | null
          custom_id: string
          is_prod: boolean | null
          is_emulator: boolean | null
        }
        Insert: {
          created_at?: string | null
          updated_at?: string | null
          device_id: string
          version: number
          app_id: string
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          os_version?: string | null
          date_id?: string | null
          version_build?: string | null
          custom_id?: string
          is_prod?: boolean | null
          is_emulator?: boolean | null
        }
        Update: {
          created_at?: string | null
          updated_at?: string | null
          device_id?: string
          version?: number
          app_id?: string
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          os_version?: string | null
          date_id?: string | null
          version_build?: string | null
          custom_id?: string
          is_prod?: boolean | null
          is_emulator?: boolean | null
        }
      }
      devices_onprem: {
        Row: {
          created_at: string | null
          updated_at: string | null
          platform: Database["public"]["Enums"]["platform_os"] | null
          plugin_version: string
          version: string | null
          app_id: string | null
          device_id: string | null
          os_version: string | null
          id: string
          version_build: string | null
          custom_id: string | null
          is_prod: boolean | null
          is_emulator: boolean | null
        }
        Insert: {
          created_at?: string | null
          updated_at?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          version?: string | null
          app_id?: string | null
          device_id?: string | null
          os_version?: string | null
          id?: string
          version_build?: string | null
          custom_id?: string | null
          is_prod?: boolean | null
          is_emulator?: boolean | null
        }
        Update: {
          created_at?: string | null
          updated_at?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          version?: string | null
          app_id?: string | null
          device_id?: string | null
          os_version?: string | null
          id?: string
          version_build?: string | null
          custom_id?: string | null
          is_prod?: boolean | null
          is_emulator?: boolean | null
        }
      }
      devices_override: {
        Row: {
          created_at: string | null
          updated_at: string | null
          device_id: string
          version: number
          app_id: string
          created_by: string | null
        }
        Insert: {
          created_at?: string | null
          updated_at?: string | null
          device_id: string
          version: number
          app_id: string
          created_by?: string | null
        }
        Update: {
          created_at?: string | null
          updated_at?: string | null
          device_id?: string
          version?: number
          app_id?: string
          created_by?: string | null
        }
      }
      global_stats: {
        Row: {
          created_at: string | null
          date_id: string
          apps: number
          updates: number
          stars: number
          users: number | null
          paying: number | null
          trial: number | null
          need_upgrade: number | null
          not_paying: number | null
        }
        Insert: {
          created_at?: string | null
          date_id: string
          apps: number
          updates: number
          stars: number
          users?: number | null
          paying?: number | null
          trial?: number | null
          need_upgrade?: number | null
          not_paying?: number | null
        }
        Update: {
          created_at?: string | null
          date_id?: string
          apps?: number
          updates?: number
          stars?: number
          users?: number | null
          paying?: number | null
          trial?: number | null
          need_upgrade?: number | null
          not_paying?: number | null
        }
      }
      notifications: {
        Row: {
          id: string
          created_at: string | null
          updated_at: string | null
          user_id: string
          last_send_at: string
          total_send: number
        }
        Insert: {
          id: string
          created_at?: string | null
          updated_at?: string | null
          user_id: string
          last_send_at?: string
          total_send?: number
        }
        Update: {
          id?: string
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
          last_send_at?: string
          total_send?: number
        }
      }
      pay_as_you_go: {
        Row: {
          id: number
          created_at: string | null
          mau: number
          storage: number
          bandwidth: number
          type: Database["public"]["Enums"]["pay_as_you_go_type"]
        }
        Insert: {
          id?: number
          created_at?: string | null
          mau: number
          storage: number
          bandwidth: number
          type: Database["public"]["Enums"]["pay_as_you_go_type"]
        }
        Update: {
          id?: number
          created_at?: string | null
          mau?: number
          storage?: number
          bandwidth?: number
          type?: Database["public"]["Enums"]["pay_as_you_go_type"]
        }
      }
      plans: {
        Row: {
          created_at: string
          updated_at: string
          name: string
          description: string
          price_m: number
          price_y: number
          stripe_id: string
          app: number
          channel: number
          update: number
          version: number
          shared: number
          abtest: boolean
          progressive_deploy: boolean
          id: string
          price_m_id: string
          price_y_id: string
          storage: number
          bandwidth: number
          mau: number
          market_desc: string | null
          storage_unit: number | null
          bandwidth_unit: number | null
          mau_unit: number | null
        }
        Insert: {
          created_at?: string
          updated_at?: string
          name?: string
          description?: string
          price_m?: number
          price_y?: number
          stripe_id?: string
          app?: number
          channel?: number
          update?: number
          version?: number
          shared?: number
          abtest?: boolean
          progressive_deploy?: boolean
          id?: string
          price_m_id: string
          price_y_id: string
          storage: number
          bandwidth: number
          mau?: number
          market_desc?: string | null
          storage_unit?: number | null
          bandwidth_unit?: number | null
          mau_unit?: number | null
        }
        Update: {
          created_at?: string
          updated_at?: string
          name?: string
          description?: string
          price_m?: number
          price_y?: number
          stripe_id?: string
          app?: number
          channel?: number
          update?: number
          version?: number
          shared?: number
          abtest?: boolean
          progressive_deploy?: boolean
          id?: string
          price_m_id?: string
          price_y_id?: string
          storage?: number
          bandwidth?: number
          mau?: number
          market_desc?: string | null
          storage_unit?: number | null
          bandwidth_unit?: number | null
          mau_unit?: number | null
        }
      }
      stats: {
        Row: {
          id: number
          created_at: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          action: string
          device_id: string
          version_build: string
          version: number
          app_id: string
          updated_at: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          action: string
          device_id: string
          version_build: string
          version: number
          app_id: string
          updated_at?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          platform?: Database["public"]["Enums"]["platform_os"]
          action?: string
          device_id?: string
          version_build?: string
          version?: number
          app_id?: string
          updated_at?: string | null
        }
      }
      stats_onprem: {
        Row: {
          id: number
          created_at: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          action: string
          device_id: string
          version_build: string
          app_id: string
          updated_at: string | null
          version: string
        }
        Insert: {
          id?: number
          created_at?: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          action: string
          device_id: string
          version_build: string
          app_id: string
          updated_at?: string | null
          version: string
        }
        Update: {
          id?: number
          created_at?: string | null
          platform?: Database["public"]["Enums"]["platform_os"]
          action?: string
          device_id?: string
          version_build?: string
          app_id?: string
          updated_at?: string | null
          version?: string
        }
      }
      stripe_info: {
        Row: {
          created_at: string
          updated_at: string
          subscription_id: string | null
          customer_id: string
          status: Database["public"]["Enums"]["stripe_status"] | null
          product_id: string
          trial_at: string
          price_id: string | null
          is_good_plan: boolean | null
        }
        Insert: {
          created_at?: string
          updated_at?: string
          subscription_id?: string | null
          customer_id: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          product_id?: string
          trial_at?: string
          price_id?: string | null
          is_good_plan?: boolean | null
        }
        Update: {
          created_at?: string
          updated_at?: string
          subscription_id?: string | null
          customer_id?: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          product_id?: string
          trial_at?: string
          price_id?: string | null
          is_good_plan?: boolean | null
        }
      }
      users: {
        Row: {
          created_at: string | null
          image_url: string | null
          first_name: string | null
          last_name: string | null
          country: string | null
          email: string
          id: string
          updated_at: string | null
          enableNotifications: boolean
          optForNewsletters: boolean
          legalAccepted: boolean
          customer_id: string | null
        }
        Insert: {
          created_at?: string | null
          image_url?: string | null
          first_name?: string | null
          last_name?: string | null
          country?: string | null
          email: string
          id: string
          updated_at?: string | null
          enableNotifications?: boolean
          optForNewsletters?: boolean
          legalAccepted?: boolean
          customer_id?: string | null
        }
        Update: {
          created_at?: string | null
          image_url?: string | null
          first_name?: string | null
          last_name?: string | null
          country?: string | null
          email?: string
          id?: string
          updated_at?: string | null
          enableNotifications?: boolean
          optForNewsletters?: boolean
          legalAccepted?: boolean
          customer_id?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bubu: {
        Args: Record<PropertyKey, never>
        Returns: { mau: number; bandwidth: number; storage: number }[]
      }
      count_all_apps: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_updates: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      exist_app: {
        Args: { appid: string; apikey: string }
        Returns: boolean
      }
      exist_app_versions: {
        Args: { appid: string; name_version: string; apikey: string }
        Returns: boolean
      }
      exist_channel: {
        Args: { appid: string; name_channel: string; apikey: string }
        Returns: boolean
      }
      exist_user: {
        Args: { e_mail: string }
        Returns: string
      }
      find_best_plan: {
        Args: {
          apps_n: number
          channels_n: number
          updates_n: number
          versions_n: number
          shared_n: number
        }
        Returns: string
      }
      find_best_plan_v2: {
        Args: { mau: number; storage: number; bandwidth: number }
        Returns: string
      }
      find_fit_plan: {
        Args: {
          apps_n: number
          channels_n: number
          updates_n: number
          versions_n: number
          shared_n: number
        }
        Returns: { name: string }[]
      }
      find_fit_plan_v2: {
        Args: { mau: number; storage: number; bandwidth: number }
        Returns: { name: string }[]
      }
      get_current_plan_max: {
        Args: { userid: string }
        Returns: { mau: number; bandwidth: number; storage: number }[]
      }
      get_current_plan_name: {
        Args: { userid: string }
        Returns: string
      }
      get_dl_by_month: {
        Args: { userid: string; pastmonth: number }
        Returns: { app_id: string; maxdownload: number }[]
      }
      get_dl_by_month_by_app:
        | {
            Args: { pastmonth: number; appid: string }
            Returns: number
          }
        | {
            Args: { userid: string; pastmonth: number; appid: string }
            Returns: { app_id: string; maxdownload: number }[]
          }
      get_max_channel: {
        Args: { userid: string }
        Returns: number
      }
      get_max_plan: {
        Args: { userid: string }
        Returns: { mau: number; storage: number; bandwidth: number }[]
      }
      get_max_shared: {
        Args: { userid: string }
        Returns: number
      }
      get_max_stats: {
        Args: { userid: string; dateid: string }
        Returns: {
          max_channel: number
          max_shared: number
          max_update: number
          max_version: number
          max_app: number
          max_device: number
        }[]
      }
      get_max_version: {
        Args: { userid: string }
        Returns: number
      }
      get_stats: {
        Args: { userid: string; dateid: string }
        Returns: {
          max_channel: number
          max_shared: number
          max_update: number
          max_version: number
          max_app: number
          max_device: number
          mau: number
        }[]
      }
      get_total_stats: {
        Args: { userid: string; dateid: string }
        Returns: { mau: number; storage: number; bandwidth: number }[]
      }
      get_user_id: {
        Args: { apikey: string }
        Returns: string
      }
      increment_stats: {
        Args: {
          app_id: string
          date_id: string
          bandwidth: number
          version_size: number
          channels: number
          shared: number
          mlu: number
          mlu_real: number
          versions: number
          devices: number
        }
        Returns: undefined
      }
      increment_version_stats: {
        Args: { app_id: string; version_id: number; devices: number }
        Returns: undefined
      }
      is_admin: {
        Args: { userid: string }
        Returns: boolean
      }
      is_allowed_action:
        | {
            Args: { apikey: string }
            Returns: boolean
          }
        | {
            Args: { userid: string }
            Returns: boolean
          }
      is_allowed_action_user: {
        Args: { userid: string }
        Returns: boolean
      }
      is_allowed_capgkey:
        | {
            Args: {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
            }
            Returns: boolean
          }
        | {
            Args: {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
              app_id: string
            }
            Returns: boolean
          }
      is_app_owner: {
        Args: { userid: string; appid: string }
        Returns: boolean
      }
      is_app_shared: {
        Args: { userid: string; appid: string }
        Returns: boolean
      }
      is_canceled: {
        Args: { userid: string }
        Returns: boolean
      }
      is_good_plan: {
        Args: { userid: string }
        Returns: boolean
      }
      is_good_plan_v2: {
        Args: { userid: string }
        Returns: boolean
      }
      is_in_channel: {
        Args: { userid: string; ownerid: string }
        Returns: boolean
      }
      is_not_deleted: {
        Args: { email_check: string }
        Returns: boolean
      }
      is_onboarded: {
        Args: { userid: string }
        Returns: boolean
      }
      is_onboarding_needed: {
        Args: { userid: string }
        Returns: boolean
      }
      is_paying: {
        Args: { userid: string }
        Returns: boolean
      }
      is_trial: {
        Args: { userid: string }
        Returns: number
      }
      is_version_shared: {
        Args: { userid: string; versionid: number }
        Returns: boolean
      }
    }
    Enums: {
      app_mode: "prod" | "dev" | "livereload"
      key_mode: "read" | "write" | "all" | "upload"
      pay_as_you_go_type: "base" | "units"
      platform_os: "ios" | "android"
      stripe_status:
        | "created"
        | "succeeded"
        | "updated"
        | "failed"
        | "deleted"
        | "canceled"
    }
  }
}
