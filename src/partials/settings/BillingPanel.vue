<script>
export default {
  name: 'BillingPanel',
}
</script>

<template>
  <div class="grow">
    <!-- Panel body -->
    <div class="p-6 space-y-6">
      <div>
        <h2 class="text-2xl text-slate-800 font-bold mb-4">
          Billing & Invoices
        </h2>
        <div class="text-sm">
          This workspace’s Basic Plan is set to <strong class="font-medium">$34</strong> per month and will renew on <strong class="font-medium">July 9, 2021</strong>.
        </div>
      </div>

      <!-- Billing Information -->
      <section>
        <h3 class="text-xl leading-snug text-slate-800 font-bold mb-1">
          Billing Information
        </h3>
        <ul>
          <li class="md:flex md:justify-between md:items-center py-3 border-b border-slate-200">
            <!-- Left -->
            <div class="text-sm text-slate-800 font-medium">
              Payment Method
            </div>
            <!-- Right -->
            <div class="text-sm text-slate-800ml-4">
              <span class="mr-3">Mastercard ending 9282</span>
              <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">Edit</a>
            </div>
          </li>
          <li class="md:flex md:justify-between md:items-center py-3 border-b border-slate-200">
            <!-- Left -->
            <div class="text-sm text-slate-800 font-medium">
              Billing Interval
            </div>
            <!-- Right -->
            <div class="text-sm text-slate-800ml-4">
              <span class="mr-3">Annually</span>
              <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">Edit</a>
            </div>
          </li>
          <li class="md:flex md:justify-between md:items-center py-3 border-b border-slate-200">
            <!-- Left -->
            <div class="text-sm text-slate-800 font-medium">
              VAT/GST Number
            </div>
            <!-- Right -->
            <div class="text-sm text-slate-800ml-4">
              <span class="mr-3">UK849700927</span>
              <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">Edit</a>
            </div>
          </li>
          <li class="md:flex md:justify-between md:items-center py-3 border-b border-slate-200">
            <!-- Left -->
            <div class="text-sm text-slate-800 font-medium">
              Your Address
            </div>
            <!-- Right -->
            <div class="text-sm text-slate-800ml-4">
              <span class="mr-3">34 Savoy Street, London, UK, 24E8X</span>
              <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">Edit</a>
            </div>
          </li>
          <li class="md:flex md:justify-between md:items-center py-3 border-b border-slate-200">
            <!-- Left -->
            <div class="text-sm text-slate-800 font-medium">
              Billing Address
            </div>
            <!-- Right -->
            <div class="text-sm text-slate-800ml-4">
              <span class="mr-3">hello@cruip.com</span>
              <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">Edit</a>
            </div>
          </li>
        </ul>
      </section>

      <!-- Invoices -->
      <section>
        <h3 class="text-xl leading-snug text-slate-800 font-bold mb-1">
          Invoices
        </h3>
        <!-- Table -->
        <table class="table-auto w-full">
          <!-- Table header -->
          <thead class="text-xs uppercase text-slate-400">
            <tr class="flex flex-wrap md:table-row md:flex-no-wrap">
              <th class="w-full block md:w-auto md:table-cell py-2">
                <div class="font-semibold text-left">
                  Year
                </div>
              </th>
              <th class="w-full hidden md:w-auto md:table-cell py-2">
                <div class="font-semibold text-left">
                  Plan
                </div>
              </th>
              <th class="w-full hidden md:w-auto md:table-cell py-2">
                <div class="font-semibold text-left">
                  Amount
                </div>
              </th>
              <th class="w-full hidden md:w-auto md:table-cell py-2">
                <div class="font-semibold text-right" />
              </th>
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm">
            <!-- Row -->
            <tr class="flex flex-wrap md:table-row md:flex-no-wrap border-b border-slate-200 py-2 md:py-0">
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-left font-medium text-slate-800">
                  2021
                </div>
              </td>
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-left">
                  Basic Plan - Annualy
                </div>
              </td>
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-left font-medium">
                  $349.00
                </div>
              </td>
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-right flex items-center md:justify-end">
                  <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">HTML</a>
                  <span class="block w-px h-4 bg-slate-200 mx-2" aria-hidden="true" />
                  <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">PDF</a>
                </div>
              </td>
            </tr>
            <!-- Row -->
            <tr class="flex flex-wrap md:table-row md:flex-no-wrap border-b border-slate-200 py-2 md:py-0">
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-left font-medium text-slate-800">
                  2020
                </div>
              </td>
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-left">
                  Basic Plan - Annualy
                </div>
              </td>
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-left font-medium">
                  $349.00
                </div>
              </td>
              <td class="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                <div class="text-right flex items-center md:justify-end">
                  <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">HTML</a>
                  <span class="block w-px h-4 bg-slate-200 mx-2" aria-hidden="true" />
                  <a class="font-medium text-indigo-500 hover:text-indigo-600" href="#0">PDF</a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <!-- Panel footer -->
    <footer>
      <div class="flex flex-col px-6 py-5 border-t border-slate-200">
        <div class="flex self-end">
          <button class="btn border-slate-200 hover:border-slate-300 text-slate-600">
            Cancel
          </button>
          <button class="btn bg-indigo-500 hover:bg-indigo-600 text-white ml-3">
            Save Changes
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>
