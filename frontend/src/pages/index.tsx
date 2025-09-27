import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  
  // Check if user is logged in and redirect to dashboard
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-900 to-primary-700 text-white">
      <Head>
        <title>Nexus Solar Platform | The Future of Solar Energy Management</title>
        <meta name="description" content="The world's most advanced multi-tenant solar energy management platform" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="container mx-auto px-6 py-8">
        <nav className="flex justify-between items-center">
          <div className="text-2xl font-bold">Nexus Solar</div>
          <div className="space-x-4">
            <Link href="/login" className="px-4 py-2 rounded-lg bg-white text-primary-900 font-medium hover:bg-gray-100 transition-colors">
              Login
            </Link>
            <Link href="/register" className="px-4 py-2 rounded-lg border border-white font-medium hover:bg-white hover:text-primary-900 transition-colors">
              Register
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-8">
            The Future of Solar Energy Management
          </h1>
          <p className="text-xl md:text-2xl mb-12">
            Nexus combines cutting-edge AI, blockchain technology, and predictive analytics to create unprecedented value for every stakeholder in the solar ecosystem.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/register" className="px-8 py-4 rounded-xl bg-white text-primary-900 font-bold text-lg hover:bg-gray-100 transition-colors">
              Get Started
            </Link>
            <Link href="/about" className="px-8 py-4 rounded-xl border border-white font-bold text-lg hover:bg-white hover:text-primary-900 transition-colors">
              Learn More
            </Link>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-primary-800 p-8 rounded-2xl">
            <h2 className="text-2xl font-bold mb-4">AI-Powered Bill Reconciliation</h2>
            <p>Automatic PDF bill analysis and grid/solar reconciliation for maximum savings.</p>
          </div>
          <div className="bg-primary-800 p-8 rounded-2xl">
            <h2 className="text-2xl font-bold mb-4">Predictive Analytics</h2>
            <p>ML-powered predictions across all major data points for optimal decision making.</p>
          </div>
          <div className="bg-primary-800 p-8 rounded-2xl">
            <h2 className="text-2xl font-bold mb-4">Edge AI Processing</h2>
            <p>Sub-second response times with offline capability for uninterrupted service.</p>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 mt-16 border-t border-primary-600">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="text-lg font-medium mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Nexus Solar. All rights reserved.
          </div>
          <div className="flex space-x-6">
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:underline">
              Contact Us
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}