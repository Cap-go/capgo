export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      apikeys: {
        Row: {
          created_at: string | null
          id: number
          key: string
          limited_to_orgs: string[] | null
          mode: Database["public"]["Enums"]["key_mode"]
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          key: string
          limited_to_orgs?: string[] | null
          mode: Database["public"]["Enums"]["key_mode"]
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          key?: string
          limited_to_orgs?: string[] | null
          mode?: Database["public"]["Enums"]["key_mode"]
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apikeys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          app_id: string
          checksum: string | null
          created_at: string | null
          deleted: boolean
          external_url: string | null
          id: number
          manifest:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version: string | null
          name: string
          native_packages: Json[] | null
          owner_org: string
          r2_path: string | null
          session_key: string | null
          storage_provider: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          checksum?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          manifest?:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version?: string | null
          name: string
          native_packages?: Json[] | null
          owner_org: string
          r2_path?: string | null
          session_key?: string | null
          storage_provider?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          checksum?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          manifest?:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version?: string | null
          name?: string
          native_packages?: Json[] | null
          owner_org?: string
          r2_path?: string | null
          session_key?: string | null
          storage_provider?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_versions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
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
          owner_org: string
          size: number
          uninstalls: number | null
          updated_at: string | null
        }
        Insert: {
          app_id: string
          checksum: string
          created_at?: string | null
          devices?: number | null
          fails?: number | null
          id?: number
          installs?: number | null
          owner_org: string
          size: number
          uninstalls?: number | null
          updated_at?: string | null
        }
        Update: {
          app_id?: string
          checksum?: string
          created_at?: string | null
          devices?: number | null
          fails?: number | null
          id?: number
          installs?: number | null
          owner_org?: string
          size?: number
          uninstalls?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_versions_meta_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "app_versions_meta_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      apps: {
        Row: {
          app_id: string
          created_at: string | null
          default_upload_channel: string
          icon_url: string
          id: string | null
          last_version: string | null
          name: string | null
          owner_org: string
          retention: number
          transfer_history: Json[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          default_upload_channel?: string
          icon_url: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          owner_org: string
          retention?: number
          transfer_history?: Json[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          default_upload_channel?: string
          icon_url?: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          owner_org?: string
          retention?: number
          transfer_history?: Json[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      bandwidth_usage: {
        Row: {
          app_id: string
          device_id: string
          file_size: number
          id: number
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          file_size: number
          id?: number
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          file_size?: number
          id?: number
          timestamp?: string
        }
        Relationships: []
      }
      channel_devices: {
        Row: {
          app_id: string
          channel_id: number
          created_at: string | null
          device_id: string
          id: number
          owner_org: string
          updated_at: string
        }
        Insert: {
          app_id: string
          channel_id: number
          created_at?: string | null
          device_id: string
          id?: number
          owner_org: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          channel_id?: number
          created_at?: string | null
          device_id?: string
          id?: number
          owner_org?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_devices_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channel_devices_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          allow_dev: boolean
          allow_device_self_set: boolean
          allow_emulator: boolean
          android: boolean
          app_id: string
          created_at: string
          created_by: string | null
          disable_auto_update: Database["public"]["Enums"]["disable_update"]
          disable_auto_update_under_native: boolean
          id: number
          ios: boolean
          name: string
          owner_org: string
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
          created_at?: string
          created_by?: string | null
          disable_auto_update?: Database["public"]["Enums"]["disable_update"]
          disable_auto_update_under_native?: boolean
          id?: number
          ios?: boolean
          name: string
          owner_org: string
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
          created_at?: string
          created_by?: string | null
          disable_auto_update?: Database["public"]["Enums"]["disable_update"]
          disable_auto_update_under_native?: boolean
          id?: number
          ios?: boolean
          name?: string
          owner_org?: string
          public?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "channels_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channels_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_bandwidth: {
        Row: {
          app_id: string
          bandwidth: number
          date: string
          id: number
        }
        Insert: {
          app_id: string
          bandwidth: number
          date: string
          id?: number
        }
        Update: {
          app_id?: string
          bandwidth?: number
          date?: string
          id?: number
        }
        Relationships: []
      }
      daily_mau: {
        Row: {
          app_id: string
          date: string
          id: number
          mau: number
        }
        Insert: {
          app_id: string
          date: string
          id?: number
          mau: number
        }
        Update: {
          app_id?: string
          date?: string
          id?: number
          mau?: number
        }
        Relationships: []
      }
      daily_storage: {
        Row: {
          app_id: string
          date: string
          id: number
          storage: number
        }
        Insert: {
          app_id: string
          date: string
          id?: number
          storage: number
        }
        Update: {
          app_id?: string
          date?: string
          id?: number
          storage?: number
        }
        Relationships: []
      }
      daily_version: {
        Row: {
          app_id: string
          date: string
          fail: number | null
          get: number | null
          install: number | null
          uninstall: number | null
          version_id: number
        }
        Insert: {
          app_id: string
          date: string
          fail?: number | null
          get?: number | null
          install?: number | null
          uninstall?: number | null
          version_id: number
        }
        Update: {
          app_id?: string
          date?: string
          fail?: number | null
          get?: number | null
          install?: number | null
          uninstall?: number | null
          version_id?: number
        }
        Relationships: []
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
      device_usage: {
        Row: {
          app_id: string
          device_id: string
          id: number
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          id?: number
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          id?: number
          timestamp?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          app_id: string
          custom_id: string
          device_id: string
          is_emulator: boolean | null
          is_prod: boolean | null
          os_version: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          plugin_version: string
          updated_at: string
          version: number
          version_build: string | null
        }
        Insert: {
          app_id: string
          custom_id?: string
          device_id: string
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          plugin_version?: string
          updated_at: string
          version: number
          version_build?: string | null
        }
        Update: {
          app_id?: string
          custom_id?: string
          device_id?: string
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"]
          plugin_version?: string
          updated_at?: string
          version?: number
          version_build?: string | null
        }
        Relationships: []
      }
      global_stats: {
        Row: {
          apps: number
          apps_active: number | null
          created_at: string | null
          date_id: string
          need_upgrade: number | null
          not_paying: number | null
          onboarded: number | null
          paying: number | null
          paying_monthly: number | null
          paying_yearly: number | null
          stars: number
          trial: number | null
          updates: number
          updates_external: number | null
          updates_last_month: number | null
          users: number | null
          users_active: number | null
        }
        Insert: {
          apps: number
          apps_active?: number | null
          created_at?: string | null
          date_id: string
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          stars: number
          trial?: number | null
          updates: number
          updates_external?: number | null
          updates_last_month?: number | null
          users?: number | null
          users_active?: number | null
        }
        Update: {
          apps?: number
          apps_active?: number | null
          created_at?: string | null
          date_id?: string
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          stars?: number
          trial?: number | null
          updates?: number
          updates_external?: number | null
          updates_last_month?: number | null
          users?: number | null
          users_active?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          event: string
          last_send_at: string
          owner_org: string
          total_send: number
          uniq_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event: string
          last_send_at?: string
          owner_org: string
          total_send?: number
          uniq_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string
          last_send_at?: string
          owner_org?: string
          total_send?: number
          uniq_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
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
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "org_users_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          created_by: string
          customer_id: string | null
          id: string
          logo: string | null
          management_email: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          customer_id?: string | null
          id?: string
          logo?: string | null
          management_email: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          customer_id?: string | null
          id?: string
          logo?: string | null
          management_email?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orgs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "stripe_info"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      plans: {
        Row: {
          bandwidth: number
          bandwidth_unit: number | null
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
          storage: number
          storage_unit: number | null
          stripe_id: string
          updated_at: string
        }
        Insert: {
          bandwidth: number
          bandwidth_unit?: number | null
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
          storage: number
          storage_unit?: number | null
          stripe_id?: string
          updated_at?: string
        }
        Update: {
          bandwidth?: number
          bandwidth_unit?: number | null
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
          storage?: number
          storage_unit?: number | null
          stripe_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stats: {
        Row: {
          action: Database["public"]["Enums"]["stats_action"]
          app_id: string
          created_at: string
          device_id: string
          version: number
        }
        Insert: {
          action: Database["public"]["Enums"]["stats_action"]
          app_id: string
          created_at: string
          device_id: string
          version: number
        }
        Update: {
          action?: Database["public"]["Enums"]["stats_action"]
          app_id?: string
          created_at?: string
          device_id?: string
          version?: number
        }
        Relationships: []
      }
      storage_usage: {
        Row: {
          app_id: string
          device_id: string
          file_size: number
          id: number
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          file_size: number
          id?: number
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          file_size?: number
          id?: number
          timestamp?: string
        }
        Relationships: []
      }
      stripe_info: {
        Row: {
          canceled_at: string | null
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
          canceled_at?: string | null
          created_at?: string
          customer_id: string
          is_good_plan?: boolean | null
          plan_usage?: number | null
          price_id?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          subscription_anchor_end?: string
          subscription_anchor_start?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
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
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["stripe_id"]
          },
        ]
      }
      users: {
        Row: {
          ban_time: string | null
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
          ban_time?: string | null
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
          ban_time?: string | null
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
            isOneToOne: true
            referencedRelation: "stripe_info"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      version_meta: {
        Row: {
          app_id: string
          size: number
          timestamp: string
          version_id: number
        }
        Insert: {
          app_id: string
          size: number
          timestamp?: string
          version_id: number
        }
        Update: {
          app_id?: string
          size?: number
          timestamp?: string
          version_id?: number
        }
        Relationships: []
      }
      version_usage: {
        Row: {
          action: Database["public"]["Enums"]["version_action"]
          app_id: string
          timestamp: string
          version_id: number
        }
        Insert: {
          action: Database["public"]["Enums"]["version_action"]
          app_id: string
          timestamp?: string
          version_id: number
        }
        Update: {
          action?: Database["public"]["Enums"]["version_action"]
          app_id?: string
          timestamp?: string
          version_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation_to_org: {
        Args: {
          org_id: string
        }
        Returns: string
      }
      calculate_daily_app_usage: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_min_rights:
        | {
            Args: {
              min_right: Database["public"]["Enums"]["user_min_right"]
              org_id: string
              app_id: string
              channel_id: number
            }
            Returns: boolean
          }
        | {
            Args: {
              min_right: Database["public"]["Enums"]["user_min_right"]
              user_id: string
              org_id: string
              app_id: string
              channel_id: number
            }
            Returns: boolean
          }
      check_revert_to_builtin_version: {
        Args: {
          appid: string
        }
        Returns: number
      }
      cleanup_queue_messages: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
      count_active_users: {
        Args: {
          app_ids: string[]
        }
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
      count_all_plans_v2: {
        Args: Record<PropertyKey, never>
        Returns: {
          plan_name: string
          count: number
        }[]
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
      get_app_metrics:
        | {
            Args: {
              org_id: string
            }
            Returns: {
              app_id: string
              date: string
              mau: number
              storage: number
              bandwidth: number
              get: number
              fail: number
              install: number
              uninstall: number
            }[]
          }
        | {
            Args: {
              org_id: string
              start_date: string
              end_date: string
            }
            Returns: {
              app_id: string
              date: string
              mau: number
              storage: number
              bandwidth: number
              get: number
              fail: number
              install: number
              uninstall: number
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
      get_cloudflare_function_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_current_plan_max_org: {
        Args: {
          orgid: string
        }
        Returns: {
          mau: number
          bandwidth: number
          storage: number
        }[]
      }
      get_current_plan_name_org: {
        Args: {
          orgid: string
        }
        Returns: string
      }
      get_customer_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          yearly: number
          monthly: number
          total: number
        }[]
      }
      get_cycle_info_org: {
        Args: {
          orgid: string
        }
        Returns: {
          subscription_anchor_start: string
          subscription_anchor_end: string
        }[]
      }
      get_daily_version: {
        Args: {
          app_id_param: string
          start_date_param?: string
          end_date_param?: string
        }
        Returns: {
          date: string
          app_id: string
          version_id: number
          percent: number
        }[]
      }
      get_db_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_global_metrics:
        | {
            Args: {
              org_id: string
            }
            Returns: {
              date: string
              mau: number
              storage: number
              bandwidth: number
              get: number
              fail: number
              install: number
              uninstall: number
            }[]
          }
        | {
            Args: {
              org_id: string
              start_date: string
              end_date: string
            }
            Returns: {
              date: string
              mau: number
              storage: number
              bandwidth: number
              get: number
              fail: number
              install: number
              uninstall: number
            }[]
          }
      get_identity:
        | {
            Args: Record<PropertyKey, never>
            Returns: string
          }
        | {
            Args: {
              keymode: Database["public"]["Enums"]["key_mode"][]
            }
            Returns: string
          }
      get_identity_apikey_only: {
        Args: {
          keymode: Database["public"]["Enums"]["key_mode"][]
        }
        Returns: string
      }
      get_identity_org: {
        Args: {
          keymode: Database["public"]["Enums"]["key_mode"][]
          org_id: string
        }
        Returns: string
      }
      get_infos: {
        Args: {
          appid: string
          deviceid: string
          versionname: string
        }
        Returns: {
          current_version_id: number
          versiondata: Json
          channel: Json
        }[]
      }
      get_metered_usage:
        | {
            Args: Record<PropertyKey, never>
            Returns: number
          }
        | {
            Args: {
              orgid: string
            }
            Returns: Database["public"]["CompositeTypes"]["stats_table"]
          }
      get_netlify_function_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_next_cron_time: {
        Args: {
          p_schedule: string
          p_timestamp: string
        }
        Returns: string
      }
      get_next_cron_value: {
        Args: {
          pattern: string
          current_val: number
          max_val: number
        }
        Returns: number
      }
      get_org_members: {
        Args: {
          guild_id: string
        }
        Returns: {
          aid: number
          uid: string
          email: string
          image_url: string
          role: Database["public"]["Enums"]["user_min_right"]
        }[]
      }
      get_org_owner_id: {
        Args: {
          apikey: string
          app_id: string
        }
        Returns: string
      }
      get_org_perm_for_apikey: {
        Args: {
          apikey: string
          app_id: string
        }
        Returns: string
      }
      get_orgs_v5:
        | {
            Args: Record<PropertyKey, never>
            Returns: {
              gid: string
              created_by: string
              logo: string
              name: string
              role: string
              paying: boolean
              trial_left: number
              can_use_more: boolean
              is_canceled: boolean
              app_count: number
              subscription_start: string
              subscription_end: string
              management_email: string
            }[]
          }
        | {
            Args: {
              userid: string
            }
            Returns: {
              gid: string
              created_by: string
              logo: string
              name: string
              role: string
              paying: boolean
              trial_left: number
              can_use_more: boolean
              is_canceled: boolean
              app_count: number
              subscription_start: string
              subscription_end: string
              management_email: string
            }[]
          }
      get_orgs_v6:
        | {
            Args: Record<PropertyKey, never>
            Returns: {
              gid: string
              created_by: string
              logo: string
              name: string
              role: string
              paying: boolean
              trial_left: number
              can_use_more: boolean
              is_canceled: boolean
              app_count: number
              subscription_start: string
              subscription_end: string
              management_email: string
              is_yearly: boolean
            }[]
          }
        | {
            Args: {
              userid: string
            }
            Returns: {
              gid: string
              created_by: string
              logo: string
              name: string
              role: string
              paying: boolean
              trial_left: number
              can_use_more: boolean
              is_canceled: boolean
              app_count: number
              subscription_start: string
              subscription_end: string
              management_email: string
              is_yearly: boolean
            }[]
          }
      get_plan_usage_percent_detailed:
        | {
            Args: {
              orgid: string
            }
            Returns: {
              total_percent: number
              mau_percent: number
              bandwidth_percent: number
              storage_percent: number
            }[]
          }
        | {
            Args: {
              orgid: string
              cycle_start: string
              cycle_end: string
            }
            Returns: {
              total_percent: number
              mau_percent: number
              bandwidth_percent: number
              storage_percent: number
            }[]
          }
      get_process_cron_stats_job_info: {
        Args: Record<PropertyKey, never>
        Returns: {
          last_run: string
          next_run: string
        }[]
      }
      get_total_app_storage_size_orgs: {
        Args: {
          org_id: string
          app_id: string
        }
        Returns: number
      }
      get_total_metrics:
        | {
            Args: {
              org_id: string
            }
            Returns: {
              mau: number
              storage: number
              bandwidth: number
              get: number
              fail: number
              install: number
              uninstall: number
            }[]
          }
        | {
            Args: {
              org_id: string
              start_date: string
              end_date: string
            }
            Returns: {
              mau: number
              storage: number
              bandwidth: number
              get: number
              fail: number
              install: number
              uninstall: number
            }[]
          }
      get_total_storage_size:
        | {
            Args: {
              appid: string
            }
            Returns: number
          }
        | {
            Args: {
              userid: string
              appid: string
            }
            Returns: number
          }
      get_total_storage_size_org: {
        Args: {
          org_id: string
        }
        Returns: number
      }
      get_update_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          app_id: string
          failed: number
          install: number
          get: number
          success_rate: number
          healthy: boolean
        }[]
      }
      get_user_id:
        | {
            Args: {
              apikey: string
            }
            Returns: string
          }
        | {
            Args: {
              apikey: string
              app_id: string
            }
            Returns: string
          }
      get_user_main_org_id: {
        Args: {
          user_id: string
        }
        Returns: string
      }
      get_user_main_org_id_by_app_id: {
        Args: {
          app_id: string
        }
        Returns: string
      }
      get_versions_with_no_metadata: {
        Args: Record<PropertyKey, never>
        Returns: {
          app_id: string
          checksum: string | null
          created_at: string | null
          deleted: boolean
          external_url: string | null
          id: number
          manifest:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version: string | null
          name: string
          native_packages: Json[] | null
          owner_org: string
          r2_path: string | null
          session_key: string | null
          storage_provider: string
          updated_at: string | null
          user_id: string | null
        }[]
      }
      get_weekly_stats: {
        Args: {
          app_id: string
        }
        Returns: {
          all_updates: number
          failed_updates: number
          open_app: number
        }[]
      }
      has_app_right: {
        Args: {
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
        }
        Returns: boolean
      }
      has_app_right_apikey: {
        Args: {
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
          userid: string
          apikey: string
        }
        Returns: boolean
      }
      has_app_right_userid: {
        Args: {
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
          userid: string
        }
        Returns: boolean
      }
      http_post_helper: {
        Args: {
          function_name: string
          function_type: string
          body: Json
        }
        Returns: number
      }
      http_post_helper_preprod: {
        Args: {
          function_name: string
          function_type: string
          body: Json
        }
        Returns: number
      }
      invite_user_to_org: {
        Args: {
          email: string
          org_id: string
          invite_type: Database["public"]["Enums"]["user_min_right"]
        }
        Returns: string
      }
      is_admin:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_allowed_action: {
        Args: {
          apikey: string
          appid: string
        }
        Returns: boolean
      }
      is_allowed_action_org: {
        Args: {
          orgid: string
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
      is_app_owner:
        | {
            Args: {
              apikey: string
              appid: string
            }
            Returns: boolean
          }
        | {
            Args: {
              appid: string
            }
            Returns: boolean
          }
        | {
            Args: {
              userid: string
              appid: string
            }
            Returns: boolean
          }
      is_canceled_org: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_good_plan_v5_org: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_member_of_org: {
        Args: {
          user_id: string
          org_id: string
        }
        Returns: boolean
      }
      is_not_deleted: {
        Args: {
          email_check: string
        }
        Returns: boolean
      }
      is_numeric: {
        Args: {
          "": string
        }
        Returns: boolean
      }
      is_onboarded_org: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_onboarding_needed_org: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_org_yearly: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_owner_of_org: {
        Args: {
          user_id: string
          org_id: string
        }
        Returns: boolean
      }
      is_paying_and_good_plan_org: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_paying_org: {
        Args: {
          orgid: string
        }
        Returns: boolean
      }
      is_trial_org: {
        Args: {
          orgid: string
        }
        Returns: number
      }
      one_month_ahead: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      parse_cron_field: {
        Args: {
          field: string
          current_val: number
          max_val: number
        }
        Returns: number
      }
      parse_step_pattern: {
        Args: {
          pattern: string
        }
        Returns: number
      }
      process_cron_stats_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_d1_replication_batch: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_failed_uploads: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_free_trial_expired: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_function_queue: {
        Args: {
          queue_name: string
        }
        Returns: undefined
      }
      process_stats_email: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_subscribed_orgs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      read_bandwidth_usage: {
        Args: {
          p_app_id: string
          p_period_start: string
          p_period_end: string
        }
        Returns: {
          date: string
          bandwidth: number
          app_id: string
        }[]
      }
      read_device_usage: {
        Args: {
          p_app_id: string
          p_period_start: string
          p_period_end: string
        }
        Returns: {
          date: string
          mau: number
          app_id: string
        }[]
      }
      read_storage_usage: {
        Args: {
          p_app_id: string
          p_period_start: string
          p_period_end: string
        }
        Returns: {
          app_id: string
          date: string
          storage: number
        }[]
      }
      read_version_usage: {
        Args: {
          p_app_id: string
          p_period_start: string
          p_period_end: string
        }
        Returns: {
          app_id: string
          version_id: number
          date: string
          get: number
          fail: number
          install: number
          uninstall: number
        }[]
      }
      reset_and_seed_app_data: {
        Args: {
          p_app_id: string
        }
        Returns: undefined
      }
      reset_and_seed_app_stats_data: {
        Args: {
          p_app_id: string
        }
        Returns: undefined
      }
      reset_and_seed_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      reset_and_seed_stats_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      transfer_app: {
        Args: {
          p_app_id: string
          p_new_org_id: string
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
      update_notification: {
        Args: {
          p_event: string
          p_uniq_id: string
          p_owner_org: string
        }
        Returns: undefined
      }
      upsert_notification: {
        Args: {
          p_event: string
          p_uniq_id: string
          p_owner_org: string
        }
        Returns: undefined
      }
      verify_mfa: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      app_mode: "prod" | "dev" | "livereload"
      disable_update: "major" | "minor" | "patch" | "version_number" | "none"
      key_mode: "read" | "write" | "all" | "upload"
      pay_as_you_go_type: "base" | "units"
      platform_os: "ios" | "android"
      stats_action:
        | "delete"
        | "reset"
        | "set"
        | "get"
        | "set_fail"
        | "update_fail"
        | "download_fail"
        | "windows_path_fail"
        | "canonical_path_fail"
        | "directory_path_fail"
        | "unzip_fail"
        | "low_mem_fail"
        | "download_10"
        | "download_20"
        | "download_30"
        | "download_40"
        | "download_50"
        | "download_60"
        | "download_70"
        | "download_80"
        | "download_90"
        | "download_complete"
        | "decrypt_fail"
        | "app_moved_to_foreground"
        | "app_moved_to_background"
        | "uninstall"
        | "needPlanUpgrade"
        | "missingBundle"
        | "noNew"
        | "disablePlatformIos"
        | "disablePlatformAndroid"
        | "disableAutoUpdateToMajor"
        | "cannotUpdateViaPrivateChannel"
        | "disableAutoUpdateToMinor"
        | "disableAutoUpdateToPatch"
        | "channelMisconfigured"
        | "disableAutoUpdateMetadata"
        | "disableAutoUpdateUnderNative"
        | "disableDevBuild"
        | "disableEmulator"
        | "cannotGetBundle"
        | "checksum_fail"
        | "NoChannelOrOverride"
        | "setChannel"
        | "getChannel"
        | "rateLimited"
      stripe_status:
        | "created"
        | "succeeded"
        | "updated"
        | "failed"
        | "deleted"
        | "canceled"
      usage_mode: "5min" | "day" | "month" | "cycle" | "last_saved"
      user_min_right:
        | "invite_read"
        | "invite_upload"
        | "invite_write"
        | "invite_admin"
        | "invite_super_admin"
        | "read"
        | "upload"
        | "write"
        | "admin"
        | "super_admin"
      user_role: "read" | "upload" | "write" | "admin"
      version_action: "get" | "fail" | "install" | "uninstall"
    }
    CompositeTypes: {
      manifest_entry: {
        file_name: string | null
        s3_path: string | null
        file_hash: string | null
      }
      match_plan: {
        name: string | null
      }
      orgs_table: {
        id: string | null
        created_by: string | null
        created_at: string | null
        updated_at: string | null
        logo: string | null
        name: string | null
      }
      owned_orgs: {
        id: string | null
        created_by: string | null
        logo: string | null
        name: string | null
        role: string | null
      }
      stats_table: {
        mau: number | null
        bandwidth: number | null
        storage: number | null
      }
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
