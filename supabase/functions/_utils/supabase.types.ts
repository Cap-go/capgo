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
          created_at: string | null
          id: number
          key: string
          mode: Database["public"]["Enums"]["key_mode"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          key: string
          mode: Database["public"]["Enums"]["key_mode"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          key?: string
          mode?: Database["public"]["Enums"]["key_mode"]
          updated_at?: string | null
          user_id?: string
        }
      }
      app_stats: {
        Row: {
          app_id: string
          bandwidth: number
          channels: number
          created_at: string | null
          date_id: string
          devices: number
          devices_real: number
          mlu: number
          mlu_real: number
          shared: number
          updated_at: string | null
          user_id: string
          version_size: number
          versions: number
        }
        Insert: {
          app_id: string
          bandwidth?: number
          channels?: number
          created_at?: string | null
          date_id?: string
          devices?: number
          devices_real?: number
          mlu?: number
          mlu_real?: number
          shared?: number
          updated_at?: string | null
          user_id: string
          version_size?: number
          versions?: number
        }
        Update: {
          app_id?: string
          bandwidth?: number
          channels?: number
          created_at?: string | null
          date_id?: string
          devices?: number
          devices_real?: number
          mlu?: number
          mlu_real?: number
          shared?: number
          updated_at?: string | null
          user_id?: string
          version_size?: number
          versions?: number
        }
      }
      app_versions: {
        Row: {
          app_id: string
          bucket_id: string | null
          checksum: string | null
          created_at: string | null
          deleted: boolean
          external_url: string | null
          id: number
          name: string
          session_key: string | null
          storage_provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_id: string
          bucket_id?: string | null
          checksum?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          name: string
          session_key?: string | null
          storage_provider?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_id?: string
          bucket_id?: string | null
          checksum?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          name?: string
          session_key?: string | null
          storage_provider?: string
          updated_at?: string | null
          user_id?: string
        }
      }
      app_versions_meta: {
        Row: {
          app_id: string
          checksum: string
          created_at: string | null
          devices: number | null
          id: number
          size: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_id: string
          checksum: string
          created_at?: string | null
          devices?: number | null
          id?: number
          size: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_id?: string
          checksum?: string
          created_at?: string | null
          devices?: number | null
          id?: number
          size?: number
          updated_at?: string | null
          user_id?: string
        }
      }
      apps: {
        Row: {
          app_id: string
          created_at: string | null
          icon_url: string
          id: string | null
          last_version: string | null
          name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_id: string
          created_at?: string | null
          icon_url: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_id?: string
          created_at?: string | null
          icon_url?: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      channel_devices: {
        Row: {
          app_id: string
          channel_id: number
          created_at: string | null
          created_by: string
          device_id: string
          updated_at: string
        }
        Insert: {
          app_id: string
          channel_id: number
          created_at?: string | null
          created_by: string
          device_id: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          channel_id?: number
          created_at?: string | null
          created_by?: string
          device_id?: string
          updated_at?: string
        }
      }
      channel_users: {
        Row: {
          app_id: string
          channel_id: number
          created_at: string | null
          created_by: string | null
          id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          channel_id: number
          created_at?: string | null
          created_by?: string | null
          id?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          channel_id?: number
          created_at?: string | null
          created_by?: string | null
          id?: number
          updated_at?: string
          user_id?: string
        }
      }
      channels: {
        Row: {
          allow_dev: boolean
          allow_device_self_set: boolean
          allow_emulator: boolean
          android: boolean
          app_id: string
          beta: boolean
          created_at: string
          created_by: string
          disableAutoUpdateToMajor: boolean
          disableAutoUpdateUnderNative: boolean
          id: number
          ios: boolean
          name: string
          public: boolean
          updated_at: string
          version: number
        }
        Insert: {
          allow_dev?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          android?: boolean
          app_id: string
          beta?: boolean
          created_at?: string
          created_by: string
          disableAutoUpdateToMajor?: boolean
          disableAutoUpdateUnderNative?: boolean
          id?: number
          ios?: boolean
          name: string
          public?: boolean
          updated_at?: string
          version: number
        }
        Update: {
          allow_dev?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          android?: boolean
          app_id?: string
          beta?: boolean
          created_at?: string
          created_by?: string
          disableAutoUpdateToMajor?: boolean
          disableAutoUpdateUnderNative?: boolean
          id?: number
          ios?: boolean
          name?: string
          public?: boolean
          updated_at?: string
          version?: number
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
          app_id: string
          created_at: string | null
          custom_id: string
          date_id: string | null
          device_id: string
          is_emulator: boolean | null
          is_prod: boolean | null
          os_version: string | null
          platform: Database["public"]["Enums"]["platform_os"] | null
          plugin_version: string
          updated_at: string | null
          version: number
          version_build: string | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          custom_id?: string
          date_id?: string | null
          device_id: string
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          updated_at?: string | null
          version: number
          version_build?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          custom_id?: string
          date_id?: string | null
          device_id?: string
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          updated_at?: string | null
          version?: number
          version_build?: string | null
        }
      }
      devices_override: {
        Row: {
          app_id: string
          created_at: string | null
          created_by: string | null
          device_id: string
          updated_at: string | null
          version: number
        }
        Insert: {
          app_id: string
          created_at?: string | null
          created_by?: string | null
          device_id: string
          updated_at?: string | null
          version: number
        }
        Update: {
          app_id?: string
          created_at?: string | null
          created_by?: string | null
          device_id?: string
          updated_at?: string | null
          version?: number
        }
      }
      global_stats: {
        Row: {
          apps: number
          created_at: string | null
          date_id: string
          need_upgrade: number | null
          not_paying: number | null
          onboarded: number | null
          paying: number | null
          stars: number
          trial: number | null
          updates: number
          users: number | null
        }
        Insert: {
          apps: number
          created_at?: string | null
          date_id: string
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          stars: number
          trial?: number | null
          updates: number
          users?: number | null
        }
        Update: {
          apps?: number
          created_at?: string | null
          date_id?: string
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          stars?: number
          trial?: number | null
          updates?: number
          users?: number | null
        }
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          last_send_at: string
          total_send: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id: string
          last_send_at?: string
          total_send?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_send_at?: string
          total_send?: number
          updated_at?: string | null
          user_id?: string
        }
      }
      plans: {
        Row: {
          abtest: boolean
          app: number
          bandwidth: number
          bandwidth_unit: number | null
          channel: number
          created_at: string
          description: string
          id: string
          market_desc: string | null
          mau: number
          mau_unit: number | null
          name: string
          price_m: number
          price_m_bandwidth_id: string | null
          price_m_id: string
          price_m_mau_id: string | null
          price_m_storage_id: string | null
          price_y: number
          price_y_id: string
          progressive_deploy: boolean
          shared: number
          storage: number
          storage_unit: number | null
          stripe_id: string
          update: number
          updated_at: string
          version: number
        }
        Insert: {
          abtest?: boolean
          app?: number
          bandwidth: number
          bandwidth_unit?: number | null
          channel?: number
          created_at?: string
          description?: string
          id?: string
          market_desc?: string | null
          mau?: number
          mau_unit?: number | null
          name?: string
          price_m?: number
          price_m_bandwidth_id?: string | null
          price_m_id: string
          price_m_mau_id?: string | null
          price_m_storage_id?: string | null
          price_y?: number
          price_y_id: string
          progressive_deploy?: boolean
          shared?: number
          storage: number
          storage_unit?: number | null
          stripe_id?: string
          update?: number
          updated_at?: string
          version?: number
        }
        Update: {
          abtest?: boolean
          app?: number
          bandwidth?: number
          bandwidth_unit?: number | null
          channel?: number
          created_at?: string
          description?: string
          id?: string
          market_desc?: string | null
          mau?: number
          mau_unit?: number | null
          name?: string
          price_m?: number
          price_m_bandwidth_id?: string | null
          price_m_id?: string
          price_m_mau_id?: string | null
          price_m_storage_id?: string | null
          price_y?: number
          price_y_id?: string
          progressive_deploy?: boolean
          shared?: number
          storage?: number
          storage_unit?: number | null
          stripe_id?: string
          update?: number
          updated_at?: string
          version?: number
        }
      }
      stats: {
        Row: {
          action: string
          app_id: string
          created_at: string | null
          device_id: string
          id: number
          platform: Database["public"]["Enums"]["platform_os"]
          updated_at: string | null
          version: number
          version_build: string
        }
        Insert: {
          action: string
          app_id: string
          created_at?: string | null
          device_id: string
          id?: number
          platform: Database["public"]["Enums"]["platform_os"]
          updated_at?: string | null
          version: number
          version_build: string
        }
        Update: {
          action?: string
          app_id?: string
          created_at?: string | null
          device_id?: string
          id?: number
          platform?: Database["public"]["Enums"]["platform_os"]
          updated_at?: string | null
          version?: number
          version_build?: string
        }
      }
      store_apps: {
        Row: {
          app_id: string
          capacitor: boolean
          capgo: boolean
          category: string
          cordova: boolean
          created_at: string | null
          developer: string
          developer_email: string
          developer_id: string | null
          error_get_framework: string
          error_get_info: string
          error_get_similar: string
          flutter: boolean
          free: boolean
          icon: string
          installs: number
          kotlin: boolean
          lang: string | null
          native_script: boolean
          onprem: boolean
          react_native: boolean
          score: number
          summary: string
          title: string
          to_get_framework: boolean
          to_get_info: boolean
          to_get_similar: boolean
          updated_at: string
          updates: number
          url: string
        }
        Insert: {
          app_id: string
          capacitor?: boolean
          capgo?: boolean
          category?: string
          cordova?: boolean
          created_at?: string | null
          developer?: string
          developer_email?: string
          developer_id?: string | null
          error_get_framework?: string
          error_get_info?: string
          error_get_similar?: string
          flutter?: boolean
          free?: boolean
          icon?: string
          installs?: number
          kotlin?: boolean
          lang?: string | null
          native_script?: boolean
          onprem?: boolean
          react_native?: boolean
          score?: number
          summary?: string
          title?: string
          to_get_framework?: boolean
          to_get_info?: boolean
          to_get_similar?: boolean
          updated_at?: string
          updates?: number
          url?: string
        }
        Update: {
          app_id?: string
          capacitor?: boolean
          capgo?: boolean
          category?: string
          cordova?: boolean
          created_at?: string | null
          developer?: string
          developer_email?: string
          developer_id?: string | null
          error_get_framework?: string
          error_get_info?: string
          error_get_similar?: string
          flutter?: boolean
          free?: boolean
          icon?: string
          installs?: number
          kotlin?: boolean
          lang?: string | null
          native_script?: boolean
          onprem?: boolean
          react_native?: boolean
          score?: number
          summary?: string
          title?: string
          to_get_framework?: boolean
          to_get_info?: boolean
          to_get_similar?: boolean
          updated_at?: string
          updates?: number
          url?: string
        }
      }
      stripe_info: {
        Row: {
          created_at: string
          customer_id: string
          is_good_plan: boolean | null
          plan_usage: number | null
          price_id: string | null
          product_id: string
          status: Database["public"]["Enums"]["stripe_status"] | null
          subscription_anchor: string
          subscription_id: string | null
          subscription_metered: Json
          trial_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          is_good_plan?: boolean | null
          plan_usage?: number | null
          price_id?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          subscription_anchor?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          is_good_plan?: boolean | null
          plan_usage?: number | null
          price_id?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          subscription_anchor?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          billing_email: string | null
          country: string | null
          created_at: string | null
          customer_id: string | null
          email: string
          enableNotifications: boolean
          first_name: string | null
          id: string
          image_url: string | null
          last_name: string | null
          legalAccepted: boolean
          optForNewsletters: boolean
          updated_at: string | null
        }
        Insert: {
          billing_email?: string | null
          country?: string | null
          created_at?: string | null
          customer_id?: string | null
          email: string
          enableNotifications?: boolean
          first_name?: string | null
          id: string
          image_url?: string | null
          last_name?: string | null
          legalAccepted?: boolean
          optForNewsletters?: boolean
          updated_at?: string | null
        }
        Update: {
          billing_email?: string | null
          country?: string | null
          created_at?: string | null
          customer_id?: string | null
          email?: string
          enableNotifications?: boolean
          first_name?: string | null
          id?: string
          image_url?: string | null
          last_name?: string | null
          legalAccepted?: boolean
          optForNewsletters?: boolean
          updated_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      convert_bytes_to_gb: {
        Args: {
          byt: number
        }
        Returns: number
      }
      convert_bytes_to_mb: {
        Args: {
          byt: number
        }
        Returns: number
      }
      convert_gb_to_bytes: {
        Args: {
          gb: number
        }
        Returns: number
      }
      convert_mb_to_bytes: {
        Args: {
          gb: number
        }
        Returns: number
      }
      convert_number_to_percent: {
        Args: {
          val: number
          max_val: number
        }
        Returns: number
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
        Args: {
          appid: string
          apikey: string
        }
        Returns: boolean
      }
      exist_app_v2: {
        Args: {
          appid: string
        }
        Returns: boolean
      }
      exist_app_versions: {
        Args: {
          appid: string
          name_version: string
          apikey: string
        }
        Returns: boolean
      }
      exist_channel: {
        Args: {
          appid: string
          name_channel: string
          apikey: string
        }
        Returns: boolean
      }
      exist_user: {
        Args: {
          e_mail: string
        }
        Returns: string
      }
      find_best_plan_v3: {
        Args: {
          mau: number
          bandwidth: number
          storage: number
        }
        Returns: string
      }
      find_fit_plan_v3: {
        Args: {
          mau: number
          bandwidth: number
          storage: number
        }
        Returns: {
          name: string
        }[]
      }
      get_app_versions: {
        Args: {
          appid: string
          name_version: string
          apikey: string
        }
        Returns: number
      }
      get_current_plan_max: {
        Args: {
          userid: string
        }
        Returns: {
          mau: number
          bandwidth: number
          storage: number
        }[]
      }
      get_current_plan_name: {
        Args: {
          userid: string
        }
        Returns: string
      }
      get_devices_version: {
        Args: {
          app_id: string
          version_id: number
        }
        Returns: number
      }
      get_dl_by_month: {
        Args: {
          userid: string
          pastmonth: number
        }
        Returns: {
          app_id: string
          maxdownload: number
        }[]
      }
      get_dl_by_month_by_app:
        | {
            Args: {
              pastmonth: number
              appid: string
            }
            Returns: number
          }
        | {
            Args: {
              userid: string
              pastmonth: number
              appid: string
            }
            Returns: {
              app_id: string
              maxdownload: number
            }[]
          }
      get_max_channel: {
        Args: {
          userid: string
        }
        Returns: number
      }
      get_max_plan: {
        Args: {
          userid: string
        }
        Returns: {
          mau: number
          storage: number
          bandwidth: number
        }[]
      }
      get_max_shared: {
        Args: {
          userid: string
        }
        Returns: number
      }
      get_max_version: {
        Args: {
          userid: string
        }
        Returns: number
      }
      get_metered_usage: {
        Args: {
          userid: string
        }
        Returns: Database["public"]["CompositeTypes"]["stats_table"]
      }
      get_plan_usage_percent: {
        Args: {
          userid: string
          dateid: string
        }
        Returns: number
      }
      get_stats: {
        Args: {
          userid: string
          dateid: string
        }
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
      get_total_stats_v2: {
        Args: {
          userid: string
          dateid: string
        }
        Returns: {
          mau: number
          bandwidth: number
          storage: number
        }[]
      }
      get_user_id: {
        Args: {
          apikey: string
        }
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
      increment_stats_v2: {
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
          devices_real: number
        }
        Returns: undefined
      }
      increment_store: {
        Args: {
          app_id: string
          updates: number
        }
        Returns: undefined
      }
      increment_version_stats: {
        Args: {
          app_id: string
          version_id: number
          devices: number
        }
        Returns: undefined
      }
      is_admin: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_allowed_action: {
        Args: {
          apikey: string
        }
        Returns: boolean
      }
      is_allowed_action_user: {
        Args: {
          userid: string
        }
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
        Args: {
          userid: string
          appid: string
        }
        Returns: boolean
      }
      is_app_shared: {
        Args: {
          userid: string
          appid: string
        }
        Returns: boolean
      }
      is_canceled: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_free_usage: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_good_plan_v3: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_in_channel: {
        Args: {
          userid: string
          ownerid: string
        }
        Returns: boolean
      }
      is_not_deleted: {
        Args: {
          email_check: string
        }
        Returns: boolean
      }
      is_onboarded: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_onboarding_needed: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_paying: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_trial: {
        Args: {
          userid: string
        }
        Returns: number
      }
      is_version_shared: {
        Args: {
          userid: string
          versionid: number
        }
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
    CompositeTypes: {
      match_plan: {
        name: string
      }
      stats_table: {
        mau: number
        bandwidth: number
        storage: number
      }
    }
  }
}
