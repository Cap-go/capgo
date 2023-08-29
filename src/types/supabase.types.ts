export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
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
        Relationships: [
          {
            foreignKeyName: "apikeys_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      app_live: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_live_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "app_stats_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "app_stats_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      app_usage: {
        Row: {
          app_id: string
          bandwidth: number
          created_at: string | null
          id: string
          mau: number
          mode: Database["public"]["Enums"]["usage_mode"]
          storage: number
        }
        Insert: {
          app_id: string
          bandwidth?: number
          created_at?: string | null
          id?: string
          mau?: number
          mode?: Database["public"]["Enums"]["usage_mode"]
          storage?: number
        }
        Update: {
          app_id?: string
          bandwidth?: number
          created_at?: string | null
          id?: string
          mau?: number
          mode?: Database["public"]["Enums"]["usage_mode"]
          storage?: number
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "app_versions_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "app_versions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      app_versions_meta: {
        Row: {
          app_id: string
          checksum: string
          created_at: string | null
          devices: number | null
          fails: number | null
          id: number
          installs: number | null
          size: number
          uninstalls: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_id: string
          checksum: string
          created_at?: string | null
          devices?: number | null
          fails?: number | null
          id?: number
          installs?: number | null
          size: number
          uninstalls?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_id?: string
          checksum?: string
          created_at?: string | null
          devices?: number | null
          fails?: number | null
          id?: number
          installs?: number | null
          size?: number
          uninstalls?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_versions_meta_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "app_versions_meta_id_fkey"
            columns: ["id"]
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_versions_meta_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      apps: {
        Row: {
          app_id: string
          created_at: string | null
          icon_url: string
          id: string | null
          last_version: string | null
          name: string | null
          retention: number
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
          retention?: number
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
          retention?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apps_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "channel_devices_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channel_devices_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_devices_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_devices_device_id_fkey"
            columns: ["device_id"]
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "channel_users_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channel_users_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_users_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_users_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
          enable_progressive_deploy: boolean
          enableAbTesting: boolean
          id: number
          ios: boolean
          name: string
          public: boolean
          secondaryVersionPercentage: number
          secondVersion: number | null
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
          enable_progressive_deploy?: boolean
          enableAbTesting?: boolean
          id?: number
          ios?: boolean
          name: string
          public?: boolean
          secondaryVersionPercentage?: number
          secondVersion?: number | null
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
          enable_progressive_deploy?: boolean
          enableAbTesting?: boolean
          id?: number
          ios?: boolean
          name?: string
          public?: boolean
          secondaryVersionPercentage?: number
          secondVersion?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "channels_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_secondVersion_fkey"
            columns: ["secondVersion"]
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_version_fkey"
            columns: ["version"]
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          }
        ]
      }
      deleted_account: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
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
          last_mau: string
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
          last_mau?: string
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
          last_mau?: string
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          updated_at?: string | null
          version?: number
          version_build?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "devices_version_fkey"
            columns: ["version"]
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "devices_override_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "devices_override_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_override_device_id_fkey"
            columns: ["device_id"]
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "devices_override_version_fkey"
            columns: ["version"]
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      org_users: {
        Row: {
          app_id: string | null
          channel_id: number | null
          created_at: string | null
          id: number
          org_id: string
          updated_at: string | null
          user_id: string
          user_right: Database["public"]["Enums"]["user_min_right"] | null
        }
        Insert: {
          app_id?: string | null
          channel_id?: number | null
          created_at?: string | null
          id?: number
          org_id: string
          updated_at?: string | null
          user_id: string
          user_right?: Database["public"]["Enums"]["user_min_right"] | null
        }
        Update: {
          app_id?: string | null
          channel_id?: number | null
          created_at?: string | null
          id?: number
          org_id?: string
          updated_at?: string | null
          user_id?: string
          user_right?: Database["public"]["Enums"]["user_min_right"] | null
        }
        Relationships: [
          {
            foreignKeyName: "org_users_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "org_users_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_users_org_id_fkey"
            columns: ["org_id"]
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_users_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          logo: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          logo?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          logo?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      stats: {
        Row: {
          action: string
          app_id: string
          created_at: string | null
          device_id: string
          platform: Database["public"]["Enums"]["platform_os"]
          version: number
          version_build: string
        }
        Insert: {
          action: string
          app_id: string
          created_at?: string | null
          device_id: string
          platform: Database["public"]["Enums"]["platform_os"]
          version: number
          version_build: string
        }
        Update: {
          action?: string
          app_id?: string
          created_at?: string | null
          device_id?: string
          platform?: Database["public"]["Enums"]["platform_os"]
          version?: number
          version_build?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_app_id_fkey"
            columns: ["app_id"]
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "logs_device_id_fkey"
            columns: ["device_id"]
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "logs_version_fkey"
            columns: ["version"]
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: []
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
          subscription_anchor_end: string
          subscription_anchor_start: string
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
          subscription_anchor_end?: string
          subscription_anchor_start?: string
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
          subscription_anchor_end?: string
          subscription_anchor_start?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_info_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "plans"
            referencedColumns: ["stripe_id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "users_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "stripe_info"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_cycle_usage: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_daily_app_usage: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_min_rights: {
        Args: {
          min_right: Database["public"]["Enums"]["user_min_right"]
          user_id: string
          org_id: string
          app_id: string
          channel_id: number
        }
        Returns: boolean
      }
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
      count_all_need_upgrade: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_onboarded: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_paying: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_plans: {
        Args: Record<PropertyKey, never>
        Returns: {
          product_id: string
          count: number
        }[]
      }
      count_all_trial: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_updates: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
      get_apikey: {
        Args: Record<PropertyKey, never>
        Returns: string
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
      get_cycle_info: {
        Args: Record<PropertyKey, never>
        Returns: {
          subscription_anchor_start: string
          subscription_anchor_end: string
        }[]
      }
      get_db_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_devices_version: {
        Args: {
          app_id: string
          version_id: number
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
      has_min_right: {
        Args: {
          _userid: string
          _orgid: string
          _right: Database["public"]["Enums"]["user_min_right"]
          _appid?: string
          _channelid?: number
        }
        Returns: boolean
      }
      increment_store: {
        Args: {
          app_id: string
          updates: number
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
      is_not_deleted_v2: {
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
      one_month_ahead: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      remove_enum_value: {
        Args: {
          enum_type: unknown
          enum_value: string
        }
        Returns: undefined
      }
      update_app_usage:
        | {
            Args: Record<PropertyKey, never>
            Returns: undefined
          }
        | {
            Args: {
              minutes_interval: number
            }
            Returns: undefined
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
      usage_mode: "5min" | "day" | "month" | "cycle"
      user_min_right: "read" | "upload" | "write" | "admin"
      user_role: "read" | "upload" | "write" | "admin"
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
