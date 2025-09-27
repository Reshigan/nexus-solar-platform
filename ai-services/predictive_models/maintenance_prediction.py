import logging
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

logger = logging.getLogger(__name__)

class MaintenancePredictionModel:
    """
    Predictive model for solar system maintenance needs
    """
    
    def __init__(self):
        self.model = None
        self.preprocessor = None
        self.feature_names = None
        self.categorical_features = [
            'inverter_type', 
            'panel_type', 
            'installation_type',
            'climate_zone'
        ]
        self.numerical_features = [
            'system_age_years',
            'total_capacity_kw',
            'avg_daily_production_kwh',
            'production_efficiency_pct',
            'num_panels',
            'num_inverters',
            'avg_temperature',
            'humidity_exposure',
            'dust_exposure',
            'salt_exposure',
            'last_maintenance_months',
            'num_previous_failures',
            'voltage_variance_pct',
            'current_variance_pct',
            'panel_degradation_rate',
            'inverter_efficiency_pct'
        ]
        # New features specifically for older systems
        self.age_specific_features = [
            'panel_degradation_rate',
            'inverter_efficiency_pct',
            'voltage_variance_pct',
            'current_variance_pct',
            'num_previous_failures',
            'last_maintenance_months'
        ]
        
    def preprocess_data(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Preprocess the data for training or prediction
        """
        if self.preprocessor is None:
            # Create preprocessing pipeline
            numerical_transformer = Pipeline(steps=[
                ('scaler', StandardScaler())
            ])
            
            categorical_transformer = Pipeline(steps=[
                ('onehot', OneHotEncoder(handle_unknown='ignore'))
            ])
            
            self.preprocessor = ColumnTransformer(
                transformers=[
                    ('num', numerical_transformer, self.numerical_features),
                    ('cat', categorical_transformer, self.categorical_features)
                ]
            )
            
            # Fit the preprocessor if this is training data
            self.preprocessor.fit(data[self.numerical_features + self.categorical_features])
        
        # Transform the data
        X = self.preprocessor.transform(data[self.numerical_features + self.categorical_features])
        
        if 'needs_maintenance' in data.columns:
            y = data['needs_maintenance'].values
            return X, y
        
        return X, None
    
    def add_engineered_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Add engineered features to improve model performance
        """
        df = data.copy()
        
        # Calculate time-based features
        current_year = datetime.now().year
        
        # Add interaction terms for older systems
        df['age_degradation_interaction'] = df['system_age_years'] * df['panel_degradation_rate']
        df['age_efficiency_interaction'] = df['system_age_years'] * df['inverter_efficiency_pct']
        df['age_failures_interaction'] = df['system_age_years'] * df['num_previous_failures']
        
        # Add polynomial features for system age
        df['system_age_squared'] = df['system_age_years'] ** 2
        
        # Add climate interaction features
        df['temp_humidity_interaction'] = df['avg_temperature'] * df['humidity_exposure']
        df['dust_age_interaction'] = df['dust_exposure'] * df['system_age_years']
        
        # Add maintenance recency impact
        df['maintenance_recency_impact'] = np.exp(df['last_maintenance_months'] / 12)
        
        # Add specific features for older systems
        df['is_older_system'] = (df['system_age_years'] > 5).astype(int)
        
        # For older systems, add more weight to certain features
        for feature in self.age_specific_features:
            df[f'older_{feature}'] = df[feature] * df['is_older_system']
            
        # Add these new features to numerical_features
        self.numerical_features.extend([
            'age_degradation_interaction',
            'age_efficiency_interaction',
            'age_failures_interaction',
            'system_age_squared',
            'temp_humidity_interaction',
            'dust_age_interaction',
            'maintenance_recency_impact',
            'is_older_system'
        ])
        
        for feature in self.age_specific_features:
            self.numerical_features.append(f'older_{feature}')
        
        return df
    
    def train(self, training_data: pd.DataFrame, hyperparameter_tuning: bool = True) -> Dict[str, Any]:
        """
        Train the maintenance prediction model
        """
        logger.info(f"Training maintenance prediction model with {len(training_data)} records")
        
        # Add engineered features
        df = self.add_engineered_features(training_data)
        
        # Split data into older and newer systems
        older_systems = df[df['system_age_years'] > 5]
        newer_systems = df[df['system_age_years'] <= 5]
        
        logger.info(f"Training with {len(older_systems)} older systems and {len(newer_systems)} newer systems")
        
        # Preprocess the data
        X, y = self.preprocess_data(df)
        
        # Split into training and validation sets
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        if hyperparameter_tuning:
            # Define the model with hyperparameter grid
            model = GradientBoostingClassifier(random_state=42)
            param_grid = {
                'n_estimators': [100, 200, 300],
                'learning_rate': [0.01, 0.05, 0.1],
                'max_depth': [3, 5, 7],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4],
                'subsample': [0.8, 0.9, 1.0]
            }
            
            # Perform grid search
            grid_search = GridSearchCV(
                estimator=model,
                param_grid=param_grid,
                cv=5,
                scoring='f1',
                n_jobs=-1,
                verbose=1
            )
            
            grid_search.fit(X_train, y_train)
            self.model = grid_search.best_estimator_
            logger.info(f"Best hyperparameters: {grid_search.best_params_}")
        else:
            # Use default hyperparameters
            self.model = GradientBoostingClassifier(
                n_estimators=200,
                learning_rate=0.05,
                max_depth=5,
                min_samples_split=5,
                min_samples_leaf=2,
                subsample=0.9,
                random_state=42
            )
            self.model.fit(X_train, y_train)
        
        # Evaluate on validation set
        y_pred = self.model.predict(X_val)
        
        # Calculate overall metrics
        accuracy = accuracy_score(y_val, y_pred)
        precision = precision_score(y_val, y_pred)
        recall = recall_score(y_val, y_pred)
        f1 = f1_score(y_val, y_pred)
        
        logger.info(f"Overall validation metrics - Accuracy: {accuracy:.4f}, Precision: {precision:.4f}, Recall: {recall:.4f}, F1: {f1:.4f}")
        
        # Calculate metrics for older systems
        older_indices = df.iloc[X_val.shape[0]:].index[df.iloc[X_val.shape[0]:]['system_age_years'] > 5]
        if len(older_indices) > 0:
            older_X_val = X_val[older_indices]
            older_y_val = y_val[older_indices]
            older_y_pred = self.model.predict(older_X_val)
            
            older_accuracy = accuracy_score(older_y_val, older_y_pred)
            older_precision = precision_score(older_y_val, older_y_pred)
            older_recall = recall_score(older_y_val, older_y_pred)
            older_f1 = f1_score(older_y_val, older_y_pred)
            
            logger.info(f"Older systems validation metrics - Accuracy: {older_accuracy:.4f}, Precision: {older_precision:.4f}, Recall: {older_recall:.4f}, F1: {older_f1:.4f}")
        
        # Return training metrics
        return {
            'accuracy': float(accuracy),
            'precision': float(precision),
            'recall': float(recall),
            'f1_score': float(f1),
            'training_size': len(X_train),
            'validation_size': len(X_val),
            'feature_importance': dict(zip(self.numerical_features + self.categorical_features, self.model.feature_importances_))
        }
    
    def predict(self, data: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Predict maintenance needs for solar systems
        """
        if self.model is None:
            raise ValueError("Model has not been trained yet")
        
        # Add engineered features
        df = self.add_engineered_features(data)
        
        # Preprocess the data
        X, _ = self.preprocess_data(df)
        
        # Make predictions
        y_pred_proba = self.model.predict_proba(X)
        y_pred = self.model.predict(X)
        
        # Create prediction results
        results = []
        for i, (pred, proba) in enumerate(zip(y_pred, y_pred_proba)):
            maintenance_probability = float(proba[1])
            needs_maintenance = bool(pred)
            
            # Calculate confidence level
            if data.iloc[i]['system_age_years'] > 5:
                # Adjust confidence for older systems
                confidence_adjustment = 0.9  # 90% of original confidence for older systems
            else:
                confidence_adjustment = 1.0
                
            confidence = float(max(proba) * confidence_adjustment)
            
            # Determine maintenance urgency
            if maintenance_probability < 0.3:
                urgency = "low"
            elif maintenance_probability < 0.7:
                urgency = "medium"
            else:
                urgency = "high"
            
            # Get recommended maintenance actions
            maintenance_actions = self._get_maintenance_recommendations(
                data.iloc[i],
                maintenance_probability
            )
            
            results.append({
                'system_id': data.iloc[i].get('system_id', f"system_{i}"),
                'needs_maintenance': needs_maintenance,
                'maintenance_probability': maintenance_probability,
                'confidence': confidence,
                'urgency': urgency,
                'recommended_actions': maintenance_actions,
                'next_maintenance_date': self._calculate_next_maintenance_date(
                    data.iloc[i],
                    maintenance_probability
                ),
                'prediction_factors': self._get_prediction_factors(
                    data.iloc[i],
                    self.model.feature_importances_
                )
            })
        
        return results
    
    def _get_maintenance_recommendations(self, system_data: pd.Series, probability: float) -> List[str]:
        """
        Get recommended maintenance actions based on system data and prediction
        """
        recommendations = []
        
        # Basic recommendations based on system age
        if system_data['system_age_years'] > 10:
            recommendations.append("Full system inspection recommended")
            recommendations.append("Consider inverter replacement assessment")
        elif system_data['system_age_years'] > 5:
            recommendations.append("Detailed system inspection recommended")
        else:
            recommendations.append("Routine maintenance check")
        
        # Specific recommendations based on features
        if system_data['panel_degradation_rate'] > 1.0:
            recommendations.append("Panel performance assessment")
        
        if system_data['inverter_efficiency_pct'] < 95:
            recommendations.append("Inverter efficiency testing")
        
        if system_data['voltage_variance_pct'] > 5:
            recommendations.append("Electrical system diagnostic")
        
        if system_data['dust_exposure'] > 7:
            recommendations.append("Panel cleaning")
        
        if system_data['last_maintenance_months'] > 12:
            recommendations.append("Overdue for routine maintenance")
        
        return recommendations
    
    def _calculate_next_maintenance_date(self, system_data: pd.Series, probability: float) -> str:
        """
        Calculate the recommended next maintenance date
        """
        from datetime import datetime, timedelta
        
        today = datetime.now()
        
        # Base maintenance interval on system age and prediction probability
        if probability > 0.7:
            # High probability - needs maintenance soon
            days_to_add = 30
        elif probability > 0.4:
            # Medium probability
            days_to_add = 90
        else:
            # Low probability
            if system_data['system_age_years'] > 10:
                days_to_add = 180
            elif system_data['system_age_years'] > 5:
                days_to_add = 270
            else:
                days_to_add = 365
        
        # Adjust based on last maintenance
        if system_data['last_maintenance_months'] > 12:
            days_to_add = max(30, days_to_add - 60)  # Sooner if overdue
        
        next_date = today + timedelta(days=days_to_add)
        return next_date.strftime("%Y-%m-%d")
    
    def _get_prediction_factors(self, system_data: pd.Series, feature_importances: np.ndarray) -> List[Dict[str, Any]]:
        """
        Get the top factors influencing the prediction
        """
        # Combine feature names and importances
        features = self.numerical_features + self.categorical_features
        importances = feature_importances
        
        # Create a list of (feature, importance, value) tuples
        feature_data = []
        for i, feature in enumerate(features):
            if feature in system_data:
                feature_data.append({
                    'feature': feature,
                    'importance': float(importances[i]),
                    'value': float(system_data[feature]) if isinstance(system_data[feature], (int, float)) else str(system_data[feature])
                })
        
        # Sort by importance and return top 5
        return sorted(feature_data, key=lambda x: x['importance'], reverse=True)[:5]